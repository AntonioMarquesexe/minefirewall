'use strict'
const readline = require('readline');
const { stdin: input, stdout: output } = require('process')
const net = require('net')
const fs = require('fs')
const args = process.argv.slice(2)
const port = parseInt(args[0])
const redirect = {
    host: `${args[1]}`,
    port: parseInt(args[2])
}
const wlFile = "whitelist.json"

// Rejected Ips List
var rejected = []

var wl = read()

const server = new net.Server()

function read() {
    try {
        if(fs.existsSync(wlFile)) {
            return JSON.parse(fs.readFileSync(wlFile))
        }
        else {
            const emptyList = {}
            fs.writeFileSync(wlFile, JSON.stringify(emptyList))
            return emptyList
        }
    }
    catch(err) {
        fs.writeFileSync("whitelist.json", "{}")
    }
    return {}
}

function now() {
    return new Date().toLocaleTimeString("pt-PT", {  
        year: "numeric", month: "2-digit",  
        day: "numeric", hour: "2-digit", minute: "2-digit"  
    }).replace(",", "")
}

server.listen(port, () => { 
    console.log(`[${now()}] Server listening at localhost:${server.address().port}`)
})

server.on('connection', (socket) => {
    // Check IP
    const player = wl[socket.remoteAddress]
    if (player === undefined) {
        console.log(`[${now()}] Rejected ${socket.remoteAddress}`)
        rejected.push(socket.remoteAddress)
        socket.end()
        return
    }
    // Keep alive until the name is dispatched
    const client = net.Socket()

    client.connect(redirect, () => {
        console.log(`[${now()}] ${socket.remoteAddress} connected.`)
    })

    socket.on('data', (chunk) => {
        const data = new Uint8Array(chunk)
        // Data request starts with code 0xd106 (Request that gives the server the client nick)
        if (data[0] == 0xd1 && data[1] == 0x06) {
            const size = (data[2] << 8) + data[3]
            var nick =  String.fromCharCode(...data.subarray(4, 4 + size))
            if (player.nick != nick) {
                socket.write("8" + "\0" + "6{\"translate\":\"multiplayer.disconnect.not_whitelisted\"}")
                socket.end()
                client.end()
                console.log(`[${now()}] ${socket.remoteAddress} don't has match for ${nick}.`)
                return
            }
            else {
                console.log(`[${now()}] ${nick} logged in from ${player.description}(${socket.remoteAddress})`)
            }
        }
        client.write(chunk)
    })

    client.on('data', (chunk) => {
        socket.write(chunk)
    })

    socket.on('error', (err) => {
        console.log("Socket error:", err)
        client.destroy(err)
    })

    client.on('error', (err) => {
        console.log("Socket error:", err)
        socket.destroy(err)
    })

    socket.on('end', () => {
        client.end()
    })

    client.on('end', () => {
        socket.end()
    })
})

const rl = readline.createInterface({ input, output })

rl.on('line', function(line, lineCount, byteCount) {
    const args = line.split(' ')
    switch(args[0].toLowerCase()) {
        case 'update':
            wl = read()
        case 'list':
            console.log(wl)
            break
        case 'rejected':
            rejected.forEach((ip) => { console.log(ip) })
            break
        case 'add':
            if (args.length < 4) {
                console.log("add [IP] [nick] [description]")
            }
            else {
                const description = args.slice(3).join(" ")
                wl = read()
                wl[args[1]] = {
                    nick: args[2],
                    description: description
                }
                fs.writeFileSync("whitelist.json", JSON.stringify(wl), () => {})
                rejected.splice(rejected.indexOf(args[1], 1))
                wl = read()
                console.log(wl)
            }
            break
        case 'replace':
            if (args.length < 3) {
                console.log("replace [old_IP] [new_IP]")
            }
            else {
                wl = read()
                wl[args[2]] = wl[args[1]]
                delete wl[args[1]]
                fs.writeFileSync("whitelist.json", JSON.stringify(wl), () => {})
                wl = read()
                console.log(wl)
            }
            break
        case 'remove':
            if (args.length < 2) {
                console.log("remove [IP]")
            }
            else {
                wl = read()
                delete wl[args[1]]
                fs.writeFileSync("whitelist.json", JSON.stringify(wl), () => {})
                wl = read()
                console.log(wl)
            }
            break
        case 'clear':
            rejected = []
        default:
            console.log("list                               - Shows whitelist entries")
            console.log("update                             - Updates whitelist entries")
            console.log("rejected                           - Shows rejected IPs")
            console.log("clear                              - Clear rejected IPs")
            console.log("add [IP] [nick] [description]      - Add entry to whitelist")
            console.log("replace [old_IP] [new_IP]          - replace IP in whitelist's entry")
            console.log("remove [IP]                        - Remove IP from whitelist")
    }
})
