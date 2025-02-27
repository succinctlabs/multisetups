import { ArgumentParser } from 'argparse'
import * as crypto from 'crypto'
import * as shelljs from 'shelljs'
import * as fs from 'fs'
import * as path from 'path'

import {
    parseZkeyFilename,
    countDirents,
    getDirName,
    getDirNamePrefix,
    WORKSPACE_DIR
} from './utils'

const configureSubparsers = (subparsers: ArgumentParser) => {
    const parser = subparsers.add_parser(
        'contribute',
        { add_help: true },
    )

    parser.add_argument(
        '--contributorNum',
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The participant number that you received from the coordinator.'
        }
    )

    parser.add_argument(
        '--entropy',
        {
            required: false,
            action: 'store',
            default: crypto.randomBytes(128).toString('hex'),
            type: 'str',
            help: 'Custom entropy'
        }
    )
}

const contribute = async (
    contributorNum: number,
    entropy: string,
) => {
    // Get previous contribution directory
    const prevZkeyDirNamePrefix = getDirNamePrefix(contributorNum - 1);
    const prevZkeyDirName = fs.readdirSync(WORKSPACE_DIR).filter((f) => f.startsWith(prevZkeyDirNamePrefix)).sort().reverse()[0];
    const dirname = `${WORKSPACE_DIR}/${prevZkeyDirName}`;
    // Get new contribution directory
    const newZkeyDirName = getDirNamePrefix(contributorNum);
    const newDirname = `${WORKSPACE_DIR}/${newZkeyDirName}`;

    if (!fs.existsSync(newDirname)) {
        fs.mkdirSync(newDirname)
    }

    // Clear new directory
    const clearCmd = `rm ${newDirname}/*`;
    const outClearCmd = shelljs.exec(clearCmd, { silent: true });

    // newDirname must be empty
    const numNewFiles = countDirents(newDirname)
    if (numNewFiles !== 0) {
        console.error(`Error: ${newDirname} is not empty.`)
        return 1
    }

    // The directory must not be empty
    const numFiles = countDirents(dirname)
    if (numFiles === 0) {
        console.error(`Error: ${dirname} is empty. Run the 'download' subcommand first.`)
        return 1
    }

    console.log("calculating contributions...");

    // Perform contributions
    let contribNum = 0
    const contribs: any[] = []
    for (const file of fs.readdirSync(dirname)) {
        const m = parseZkeyFilename(file)
        if (m) {
            const name = m.name
            const num = m.num
            contribNum = num + 1

            const newName = `${name}.${num + 1}.zkey`
            contribs.push({
                original: file,
                'new': newName,
            })
        }
    }
    let transcript = ''

    let currentEntropy = entropy + crypto.randomBytes(128).toString('hex')

    for (const c of contribs) {
        currentEntropy = crypto.createHash('sha512').update(currentEntropy, 'utf8').digest('hex')

        const o = path.join(dirname, c.original)
        const n = path.join(newDirname, c['new'])
        console.log("Adding contribution to " + o);
        await new Promise(f => setTimeout(f, 3000));

        let out = ""
        const cmd = `node ./node_modules/.bin/snarkjs zkey contribute -v ${o} ${n}`
        let childprocess = shelljs.exec(`echo ${currentEntropy} | ${cmd}`, { async:true, silent: true })

        childprocess.stdout.on('data', function(data: string) {
            if (!data.includes("Enter a random text")) {
                console.log(data)
            }

            if (!data.includes("DEBUG")) {
                out += data
            }
        });

        await new Promise( (resolve) => {
            childprocess.on('close', resolve)
        })

        out = out.replace(/Enter a random text\. \(Entropy\): /, '$&\n')
        transcript += `${cmd}\n`
        transcript += `${out}\n\n`
    }

    const transcriptFilepath = path.join(newDirname, `transcript.${contribNum}.txt`)
    fs.writeFileSync(transcriptFilepath, transcript.trim() + '\n')
    console.log(
        `Contribution generated, and transcript written to ${transcriptFilepath}.`
    )

    return 0
}

export {
    contribute,
    configureSubparsers,
}
