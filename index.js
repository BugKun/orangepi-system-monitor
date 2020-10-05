const osUtils = require("os-utils")
const request = require('request')
const dayjs = require('./utils/dayjs')
const fs = require("fs")
const spawn = require('spawn-please')
const config = require("./config.json")


let store = {
    CPUTemperature: [],
    cpuUsage: [],
    memUsage: [],
}

function bytesToSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024, // or 1024
        sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
 
   return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
}

function now() {
    return dayjs().format('YYYY-MM-DD HH:MM:ss')
}

function sendMessage(msg) {
    return new Promise((resolve, reject) => {
        request.post(
            {
                url: `https://sc.ftqq.com/${config.SCKEY}.send`,
                form: {text: msg.title, desp: msg.content},
            },
            function (err, response, body) {
                if(err) {
                    reject(err)
                } else {
                    resolve(JSON.parse(body))
                }
            }
        )
    })
}

function getCPUTemperature() {
    return new Promise(function (resolve, reject) {
        fs.readFile('/sys/class/thermal/thermal_zone0/temp', function (err, data) {
            if(err){
                reject(err)
            } else {
                resolve(Number(data) / 1000)
            }
        })
    })
}

function getCPUUsage() {
    return new Promise(function (resolve) {
        osUtils.cpuUsage(function (cpuUsage) {
            resolve(cpuUsage * 100.0)
        })
    })
}

function getMemoryInfo() {
    return spawn('free')
    .then(stdout => {
        var lines = String(stdout).split("\n")
        var memInfoTitle = lines[0].replace( /[\s\n\r]+/g,' ').split(/\s/)
        var memInfoValue = lines[1].replace( /[\s\n\r]+/g,' ').split(/\s/)
        memInfoTitle.shift()
        memInfoValue.shift()
        var memInfo = {}
        for (var i in memInfoTitle){
            memInfo[memInfoTitle[i]] = memInfoValue[i] * 1024
        }
        return memInfo
    })
}

function getDiskInfo() {
    return spawn('df', ['-P'])
    .then(stdout => {
        var aLines = stdout.split('\n');
        aLines.shift();
        var aDrives = []
        // For each line get drive info and add to array
        for(var i = 0; i < aLines.length; i++) {					
            var sLine = aLines[i];
            if (sLine != '') {
                sLine = sLine.replace(/ +(?= )/g,'');
                var aTokens = sLine.split(' ');
                aDrives[aDrives.length] = {
                    filesystem:	aTokens[0],
                    blocks:		aTokens[1],
                    used:		aTokens[2],
                    available:	aTokens[3],
                    capacity:	aTokens[4],
                    mounted:	aTokens[5]
                }
            }
        }
        return aDrives
    })
}

function monitCPUTemperature(config) {
    getCPUTemperature()
    .then(temperature => {
        let {CPUTemperature} = store
        CPUTemperature.push(temperature)
        if(CPUTemperature.length >= Math.floor(config.duration / config.monitInterval)) {
            const avgCPUTemperature = CPUTemperature.reduce((prev, next) => prev + next) / CPUTemperature.length
            if(avgCPUTemperature > config.overload) {
                const msg = {
                    title: '[orangepi]的CPU温度告警',
                    content: `${now()}: [orangepi]的CPU温度告警：  
                    当前CPU温度：${temperature}°C，已超过警戒线${config.overload}°C，请立即处理！
                    `,
                }
                console.log(msg)
                sendMessage(msg)
                .then(res => {
                    if(res.errmsg == 'success') {
                        console.log('CPU温度告警发送成功！！')
                    }
                })
                .catch(err => {
                    console.log('发送告警失败！！', err, '告警原文：', msg)
                })
            }
            store.CPUTemperature = []
        }
        setTimeout(() => monitCPUTemperature(config), config.monitInterval)
    })
    .catch(err => {
        console.log(err)
    })
}

function monitCPUUsage(config) {
    getCPUUsage()
    .then(usage => {
        let {cpuUsage} = store
        cpuUsage.push(usage)
        if(cpuUsage.length >= Math.floor(config.duration / config.monitInterval)) {
            const avgCPUUsage = cpuUsage.reduce((prev, next) => prev + next) / cpuUsage.length
            if(avgCPUUsage > config.overload) {
                const msg = {
                    title: '[orangepi]的CPU占用告警',
                    content: `${now()}: [orangepi]的CPU占用告警：  
                    当前CPU占用：${usage.toFixed(2)}%，已超过警戒线${config.overload}%，请立即处理！
                    `,
                }
                console.log(msg)
                sendMessage(msg)
                .then(res => {
                    if(res.errmsg == 'success') {
                        console.log('CPU占用告警发送成功！！')
                    }
                })
                .catch(err => {
                    console.log('发送告警失败！！', err, '告警原文：', msg)
                })
            }
            store.cpuUsage = []
        }
        setTimeout(() => monitCPUUsage(config), config.monitInterval)
    })
}

function monitMemoryInfo(config) {
    getMemoryInfo()
    .then(memInfo => {
        const usedMemory = memInfo.total - memInfo.available
        let {memUsage} = store
        memUsage.push(usedMemory)
        if(memUsage.length >= Math.floor(config.duration / config.monitInterval)) {
            const avgMemUsage = memUsage.reduce((prev, next) => prev + next) / memUsage.length / memInfo.total * 100
            if(avgMemUsage > config.overload) {
                const msg = {
                    title: '[orangepi]的运行内存占用告警',
                    content: `${now()}: [orangepi]的运行内存占用告警：  
                    当前运行内存占用：${(usedMemory/memInfo.total*100).toFixed(2)}%，目前情况：${bytesToSize(usedMemory)}/${bytesToSize(memInfo.total)}，已超过警戒线${config.overload}%，请立即处理！
                    `,
                }
                console.log(msg)
                sendMessage(msg)
                .then(res => {
                    if(res.errmsg == 'success') {
                        console.log('运行内存告警发送成功！！')
                    }
                })
                .catch(err => {
                    console.log('发送告警失败！！', err, '告警原文：', msg)
                })
            }
            store.memUsage = []
        }
        setTimeout(() => monitMemoryInfo(config), config.monitInterval)
    })
    .catch(err => {
        console.log(err)
    })
}

function monitDiskUsage(config) {
    getDiskInfo()
    .then(diskInfo => {
        const capacity = Math.max(...diskInfo.filter(item => config.diskList.includes(item.filesystem)).map(item => Number(item.capacity.replace('%', ''))))
        if(capacity > config.overload) {
            const msg = {
                title: '[orangepi]的磁盘占用告警',
                content: `${now()}: [orangepi]的磁盘占用告警：  
                ${
                    diskInfo
                    .filter(item => config.diskList.some(disk => item.filesystem == disk))
                    .map(item => {
                        return `磁盘[${item.filesystem}]占用率：${item.capacity}，剩余空间：${bytesToSize(item.available * 1024)}，已超过警戒线${config.overload}%，请立即处理！`
                    })
                    .join('  \n')
                }
                `,
            }
            console.log(msg)
            sendMessage(msg)
            .then(res => {
                if(res.errmsg == 'success') {
                    console.log('磁盘占用告警发送成功！！')
                }
            })
            .catch(err => {
                console.log('发送告警失败！！', err, '告警原文：', msg)
            })
        }
        setTimeout(() => monitDiskUsage(config), config.monitInterval)
    })
}



function monitSystemInfo(config) {
    monitCPUTemperature({
        monitInterval: config.monitInterval,
        ...config.cpuTemperatureConfig
    })
    monitCPUUsage({
        monitInterval: config.monitInterval,
        ...config.cpuConfig
    })
    monitMemoryInfo({
        monitInterval: config.monitInterval,
        ...config.memConfig
    })
    monitDiskUsage({
        monitInterval: config.monitInterval,
        ...config.diskConfig
    })
}

monitSystemInfo(config)

sendMessage({
    title: '[orangepi]的系统监控启动',
    content: `${now()}: [orangepi]的系统监控启动成功`
})
.then(res => {
    if(res.errmsg == 'success') {
        console.log(`${now()}: [orangepi]的系统监控启动成功`)
    }
})
.catch(err => {
    console.log('发送初始化消息失败！！', err)
})