//perf data of this server!

//Node program that captures performance data of the machine
//it sends the data to the server running socker.io

// data:
// -CPU load
// -memory usage
// -OS running
// -CPU info - number of cores, clockspeed and stuff
// we can get all of this from the os module


const os = require('os');
const io = require('socket.io-client');
let socket = io('https://performance-monitor-0.herokuapp.com/');

socket.on('connect', () => {
    console.log('im connected');

    socket.emit('clientAuth', 'alsdjfhaklsdjfh237845239q');


    //we need to identify this machine to whomever concerned
    const nI = os.networkInterfaces();
    let macA;
    //loop through all the nI for this machine and find a non-internal one;
    for (let key in nI) {
        // for testing purposes
        // macA = Math.floor(Math.random() * 3) + 1;
        // break;

        //for production
        if (!nI[key][0].internal) {
            macA = nI[key][0].mac;
            break;
        }
    }

    performanceData().then(perf => {
        perf.macA = macA;
        socket.emit('initPerfData', perf);
    })


    let perfDataInterval = setInterval(() => {
        performanceData().then(perf => {
            perf.macA = macA;
            socket.emit('perfData', perf)
        });
    }, 1000)

    socket.on('disconnect', () => {
        clearInterval(perfDataInterval);
    })
})



function performanceData() {
    return new Promise(async (resolve, reject) => {
        const osType = os.type();
        const upTime = os.uptime();
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.floor(usedMem / totalMem * 100) / 100;
        const cpus = os.cpus();
        const cpuModel = cpus[0].model;
        const numCores = cpus.length;
        const cpuLoad = await getCpuLoad();
        const cpuSpeed = cpus[0].speed;
        const isActive = true;
        resolve({
            osType,
            upTime,
            freeMem,
            totalMem,
            usedMem,
            memUsage,
            cpuModel,
            numCores,
            cpuLoad,
            cpuSpeed,
            isActive
        })
    })
}

// cpus is data of all the cores. we need the average of all the cores which will give us the overall average

function cpuAverage() {
    const cpus = os.cpus();
    let idleMs = 0;
    let totalMS = 0;

    cpus.forEach(core => {
        for (type in core.times) {
            totalMS += core.times[type];
        }
        idleMs += core.times.idle;
    })

    return {
        idle: idleMs / cpus.length,
        total: totalMS / cpus.length
    }
}

function getCpuLoad() {
    return new Promise((resolve, reject) => {
        const start = cpuAverage();
        setTimeout(() => {
            const end = cpuAverage();
            const idleDifference = end.idle - start.idle;
            const totalDifference = end.total - start.total;
            const percentageCpu = 100 - Math.floor(100 * idleDifference / totalDifference);
            resolve(percentageCpu);
        }, 100)
    })
}


