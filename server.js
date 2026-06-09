 const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Su dung middleware de phan tich du lieu JSON tu request body
app.use(express.json());

// Khoi tao cau truc du lieu API
let apiData = {
  api: {
    id: "vexz-v5-7d2c8f41",
    name: "Vexz Hub API",
    owner: "Hoa",
    ttl: 60000
  },
  jobs: {
    low_players: [],
    full_moon: [],
    mirage_island: [],
    elite_pirate: [],
    dough_king: [],
    rip_indra: [],
    other_bosses: []
  }
};

// Khoi tao doi tuong theo doi thoi gian cap nhat cua tung phong
let serverTimestamps = {};

// SECRET_KEY dung cho thuat toan XOR
const SECRET_KEY = 42;
// Chuoi ma hoa de xac thuc
const AUTH_PREFIX = "HoaHubHere-";

// Ham giai ma XOR
function xorDecrypt(encryptedString, key) {
  let decryptedString = '';
  for (let i = 0; i < encryptedString.length; i++) {
    let charCode = encryptedString.charCodeAt(i);
    let decryptedCharCode = charCode ^ key;
    decryptedString += String.fromCharCode(decryptedCharCode);
  }
  return decryptedString;
}

// Ham loai bo cac phan tu trung lap trong mot mang dua tren truong duy nhat
function removeDuplicateServers(serverList) {
  let uniqueServerMap = new Map();
  for (let server of serverList) {
    if (server && server.job_id) {
      uniqueServerMap.set(server.job_id, server);
    }
  }
  return Array.from(uniqueServerMap.values());
}

// Ham tu dong phan loai server dua tren tags va current_boss
function classifyAndUpdateServer(newServerData) {
  let jobId = newServerData.job_id;
  let playersCount = newServerData.players;
  let sea = newServerData.sea;
  let tags = newServerData.tags || [];
  let currentBoss = newServerData.current_boss || '';

  // Tao ban sao du lieu server de luu tru
  let serverEntry = {
    job_id: jobId,
    players: playersCount,
    sea: sea,
    tags: tags,
    current_boss: currentBoss,
    last_updated: Date.now()
  };

  // Cap nhat thoi gian hien tai cho server
  serverTimestamps[jobId] = Date.now();

  // Logic phan loai
  let targetCategory = 'other_bosses';

  // Kiem tra low_players: neu so nguoi choi <= 4
  if (playersCount <= 4) {
    targetCategory = 'low_players';
  }
  // Kiem tra cac tags dac biet va current_boss
  else if (tags.includes('Full Moon')) {
    targetCategory = 'full_moon';
  }
  else if (tags.includes('Mirage Island')) {
    targetCategory = 'mirage_island';
  }
  else if (tags.includes('Elite Pirate')) {
    targetCategory = 'elite_pirate';
  }
  else if (currentBoss === 'Dough King' || currentBoss === 'dough_king') {
    targetCategory = 'dough_king';
  }
  else if (currentBoss === 'Rip Indra' || currentBoss === 'rip_indra') {
    targetCategory = 'rip_indra';
  }
  else {
    targetCategory = 'other_bosses';
  }

  // Them server vao danh muc tuong ung
  apiData.jobs[targetCategory].push(serverEntry);
  
  // Xoa trung lap trong danh muc do
  apiData.jobs[targetCategory] = removeDuplicateServers(apiData.jobs[targetCategory]);
}

// Ham don dep cac server cu khong con hoat dong (5 phut)
function clearStaleServers() {
  let currentTime = Date.now();
  let staleThreshold = 5 * 60 * 1000; // 5 phut

  for (let category in apiData.jobs) {
    if (apiData.jobs.hasOwnProperty(category)) {
      let originalLength = apiData.jobs[category].length;
      apiData.jobs[category] = apiData.jobs[category].filter(server => {
        if (server && server.job_id) {
          let lastUpdate = serverTimestamps[server.job_id];
          if (!lastUpdate) {
            return false; // Xoa neu khong co timestamp
          }
          return (currentTime - lastUpdate) < staleThreshold;
        }
        return false;
      });
      
      if (originalLength !== apiData.jobs[category].length) {
        console.log(`Da don dep ${originalLength - apiData.jobs[category].length} server cu trong danh muc ${category}`);
      }
    }
  }
  
  // Dong thoi don dep ca serverTimestamps de tranh ro ri bo nho
  for (let jobId in serverTimestamps) {
    if ((currentTime - serverTimestamps[jobId]) >= staleThreshold) {
      delete serverTimestamps[jobId];
    }
  }
}

// Thiet lap interval tu dong xoa du lieu cu moi 5 phut
setInterval(clearStaleServers, 5 * 60 * 1000);

// Endpoint GET /api-data: Tra ve toan bo du lieu API
app.get('/api-data', (req, res) => {
  res.json(apiData);
});

// Endpoint POST /update: Nhan du lieu cap nhat tu Roblox
app.post('/update', (req, res) => {
  try {
    let requestBody = req.body;
    let encryptedJob = requestBody.job;
    let players = requestBody.players;
    let sea = requestBody.sea;
    let tags = requestBody.tags;
    let currentBoss = requestBody.current_boss;

    // Kiem tra du lieu dau vao co day du khong
    if (!encryptedJob || players === undefined || sea === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thieu du lieu bat buoc: job, players, sea' 
      });
    }

    // Kiem tra chuoi job co bat dau bang "HoaHubHere-" khong
    if (!encryptedJob.startsWith(AUTH_PREFIX)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Xac thuc that bai: Thieu tien to bao mat' 
      });
    }

    // Cat bo tien to de lay phan da ma hoa
    let encryptedPart = encryptedJob.substring(AUTH_PREFIX.length);
    
    // Giai ma XOR de lay JobId goc cua Roblox
    let originalJobId = xorDecrypt(encryptedPart, SECRET_KEY);
    
    // Kiem tra JobId da giai ma co hop le khong
    if (!originalJobId || originalJobId.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Giai ma JobId that bai' 
      });
    }

    // Tao doi tuong du lieu server moi
    let newServerData = {
      job_id: originalJobId,
      players: players,
      sea: sea,
      tags: tags || [],
      current_boss: currentBoss || ''
    };

    // Phan loai va cap nhat server
    classifyAndUpdateServer(newServerData);

    console.log(`Da cap nhat server: ${originalJobId} - Players: ${players} - Sea: ${sea}`);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Cap nhat thanh cong', 
      job_id: originalJobId 
    });

  } catch (error) {
    console.error('Loi xu ly yeu cau cap nhat:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Loi may chu noi bo' 
    });
  }
});

// Khoi dong server
app.listen(port, () => {
  console.log(`Vexz API Server dang chay tai port ${port}`);
  console.log(`Truy cap API data tai: http://localhost:${port}/api-data`);
});
