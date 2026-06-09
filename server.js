const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Cau truc giong Kuri
let apiData = {
  api: {
    id: "2bcbf4f96454",
    name: "Vexz Hub",
    owner: "Hoa",
    ttl: 60000
  },
  jobs: {}
};

let serverTimestamps = {};
const SECRET_KEY = 42;
const AUTH_PREFIX = "HoaHubHere-";

// Ham giai ma XOR
function xorDecrypt(str, key) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ key);
  }
  return result;
}

// Ham giai ma Base64
function base64Decode(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

// Ham giai ma Job giong Kuri (Base64 + XOR)
function decryptJob(encryptedJob) {
  // Cat bo tien to
  let encoded = encryptedJob.substring(AUTH_PREFIX.length);
  // Giai ma Base64
  let decoded = base64Decode(encoded);
  // Giai ma XOR
  let jobId = xorDecrypt(decoded, SECRET_KEY);
  return jobId;
}

// Ham xoa trung lap
function removeDuplicates(arr) {
  let seen = new Map();
  for (let item of arr) {
    if (item && item.job) {
      seen.set(item.job, item);
    }
  }
  return Array.from(seen.values());
}

// Ham don dep server cu
function clearStaleServers() {
  let now = Date.now();
  let threshold = 5 * 60 * 1000; // 5 phut

  for (let boss in apiData.jobs) {
    if (apiData.jobs.hasOwnProperty(boss)) {
      apiData.jobs[boss] = apiData.jobs[boss].filter(server => {
        if (server && server.job) {
          let lastUpdate = serverTimestamps[server.job];
          return lastUpdate && (now - lastUpdate) < threshold;
        }
        return false;
      });
      
      // Xoa muc boss neu rong
      if (apiData.jobs[boss].length === 0) {
        delete apiData.jobs[boss];
      }
    }
  }
  
  // Don dep serverTimestamps
  for (let job in serverTimestamps) {
    if ((now - serverTimestamps[job]) >= threshold) {
      delete serverTimestamps[job];
    }
  }
}

setInterval(clearStaleServers, 5 * 60 * 1000);

// Endpoint GET /api-data
app.get('/api-data', (req, res) => {
  res.json(apiData);
});

// Endpoint POST /update - Giong Kuri
app.post('/update', (req, res) => {
  try {
    let { job, players, sea, boss } = req.body;

    if (!job || !players || !sea || !boss) {
      return res.status(400).json({ success: false, message: 'Thieu du lieu' });
    }

    // Kiem tra tien to
    if (!job.startsWith(AUTH_PREFIX)) {
      return res.status(403).json({ success: false, message: 'Sai tien to' });
    }

    // Giai ma JobId
    let jobId = decryptJob(job);
    
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Giai ma that bai' });
    }

    // Tao server entry giong Kuri
    let serverEntry = {
      job: job,           // Giu nguyen job da ma hoa
      players: players,
      sea: sea,
      boss: boss,
      t: Date.now()       // Timestamp
    };

    // Cap nhat timestamp
    serverTimestamps[job] = Date.now();

    // Tao muc boss neu chua co
    if (!apiData.jobs[boss]) {
      apiData.jobs[boss] = [];
    }

    // Them vao muc tuong ung
    apiData.jobs[boss].push(serverEntry);
    
    // Xoa trung lap
    apiData.jobs[boss] = removeDuplicates(apiData.jobs[boss]);

    console.log(`✅ Cap nhat: ${boss} - ${players} players - Sea ${sea}`);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Loi:', error);
    return res.status(500).json({ success: false, message: 'Loi server' });
  }
});

app.listen(port, () => {
  console.log(`Vexz API chay tai port ${port}`);
}); 
