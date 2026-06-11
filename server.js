const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

let uniqueIPs = new Set();

let apiData = {
  "Total Execute": 0,
  "by": "Hoa",
  "total_moon_servers": 0,
  "moon_data": []
};

let serverTimestamps = {};
const SECRET_KEY = 42;
const AUTH_PREFIX = "HoaHubHere-";

function xorDecrypt(str, key) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ key);
  }
  return result;
}

function decryptJob(encryptedJob) {
  let encoded = encryptedJob.substring(AUTH_PREFIX.length);
  return xorDecrypt(encoded, SECRET_KEY);
}

function formatTime() {
  let now = new Date();
  let year = now.getFullYear();
  let month = String(now.getMonth() + 1).padStart(2, '0');
  let day = String(now.getDate()).padStart(2, '0');
  let hour = String(now.getHours()).padStart(2, '0');
  let minute = String(now.getMinutes()).padStart(2, '0');
  let second = String(now.getSeconds()).padStart(2, '0');
  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
}

function removeDuplicates(arr) {
  let seen = new Map();
  for (let item of arr) {
    if (item && item.jobId) {
      seen.set(item.jobId, item);
    }
  }
  return Array.from(seen.values());
}

function clearStaleServers() {
  let now = Date.now();
  let threshold = 5 * 60 * 1000;

  apiData.moon_data = apiData.moon_data.filter(server => {
    if (server && server.jobId) {
      let lastUpdate = serverTimestamps[server.jobId];
      return lastUpdate && (now - lastUpdate) < threshold;
    }
    return false;
  });

  apiData.total_moon_servers = apiData.moon_data.length;
}

setInterval(clearStaleServers, 2 * 60 * 1000);

app.get('/api-data', (req, res) => {
  res.json(apiData);
});

app.post('/update', (req, res) => {
  try {
    let { job, players } = req.body;

    if (!job || players === undefined) {
      return res.status(400).json({ success: false, message: 'Thieu du lieu' });
    }

    if (!job.startsWith(AUTH_PREFIX)) {
      return res.status(403).json({ success: false, message: 'Sai tien to' });
    }

    let jobId = decryptJob(job);
    
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Giai ma that bai' });
    }

    let userIP = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    uniqueIPs.add(userIP);
    apiData["Total Execute"] = uniqueIPs.size;

    let serverEntry = {
      Players: players,
      jobId: jobId,
      name: "FullMoon",
      updatedAt: formatTime()
    };

    serverTimestamps[jobId] = Date.now();
    apiData.moon_data.push(serverEntry);
    apiData.moon_data = removeDuplicates(apiData.moon_data);
    apiData.total_moon_servers = apiData.moon_data.length;

    console.log('FullMoon: ' + jobId + ' | Players: ' + players + ' | IP: ' + userIP);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Loi:', error);
    return res.status(500).json({ success: false, message: 'Loi server' });
  }
});

app.listen(port, () => {
  console.log('API chay tai port ' + port);
}); 
