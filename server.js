const express = require('express');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

let apiData = {
  api: {
    id: "vexz-v5-7d2c8f41",
    name: "Vexz Hub API",
    owner: "Hoa", // Đã sửa cú pháp dấu :
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

let serverTimestamps = {};

const SECRET_KEY = 42;
const AUTH_PREFIX = "HoaHubHere-";
const HMAC_SECRET = "VexzSecretKey2024!@#$";

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

// Ham giai ma Base64
function base64Decode(encodedString) {
  return Buffer.from(encodedString, 'base64').toString('utf8');
}

// Ham tao HMAC signature
function createHMAC(data) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('hex');
}

// Ham verify HMAC signature chống Timing Attack cực tốt
function verifyHMAC(data, signature) {
  try {
    const expected = createHMAC(data);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (e) {
    return false;
  }
}

// Ham giai ma nhieu lop đồng bộ 100% với Script Lua đa tầng
function multiLayerDecrypt(encryptedData) {
  let step1 = base64Decode(encryptedData);
  let step2 = xorDecrypt(step1, SECRET_KEY);
  let step3 = Buffer.from(step2, 'base64').toString('utf8'); // Lớp cuối bọc chuẩn utf8/binary
  return step3;
}

// Hàm lọc trùng nâng cấp: xóa bỏ server có jobId cũ ra khỏi mảng
function filterDuplicate(category, jobId) {
  apiData.jobs[category] = apiData.jobs[category].filter(server => server.job_id !== jobId);
}

// HÀM PHÂN LOẠI "ALL HOP" ĐÃ SỬA LOGIC LOẠI TRỪ
function classifyAndUpdateServer(newServerData) {
  let jobId = newServerData.job_id;
  let playersCount = newServerData.players;
  let sea = newServerData.sea;
  let tags = newServerData.tags || [];
  let currentBoss = newServerData.current_boss || '';

  let serverEntry = {
    job_id: jobId,
    players: playersCount,
    sea: sea,
    tags: tags,
    current_boss: currentBoss,
    last_updated: Date.now()
  };

  serverTimestamps[jobId] = Date.now();

  // Dọn dẹp bản ghi cũ của server này ở TẤT CẢ các danh mục trước khi phân loại lại
  Object.keys(apiData.jobs).forEach(category => {
    filterDuplicate(category, jobId);
  });

  let isClassified = false;

  // Check 1: Server ít người
  if (playersCount <= 4) {
    apiData.jobs.low_players.push(serverEntry);
    isClassified = true;
  }

  // Check 2: Các sự kiện qua Tags (Chạy song song không loại trừ)
  if (tags.includes('Full Moon')) {
    apiData.jobs.full_moon.push(serverEntry);
    isClassified = true;
  }
  if (tags.includes('Mirage Island')) {
    apiData.jobs.mirage_island.push(serverEntry);
    isClassified = true;
  }
  if (tags.includes('Elite Pirate')) {
    apiData.jobs.elite_pirate.push(serverEntry);
    isClassified = true;
  }

  // Check 3: Boss lớn mục tiêu công phá
  if (currentBoss === 'Dough King' || currentBoss === 'dough_king') {
    apiData.jobs.dough_king.push(serverEntry);
    isClassified = true;
  } else if (currentBoss === 'Rip Indra' || currentBoss === 'rip_indra') {
    apiData.jobs.rip_indra.push(serverEntry);
    isClassified = true;
  }

  // Check 4: Nếu không thuộc diện ưu tiên nào ở trên mà có boss khác thì đẩy vào Boss phụ
  if (!isClassified && currentBoss && currentBoss !== '') {
    apiData.jobs.other_bosses.push(serverEntry);
  }
}

// Tự động quét dọn server die (Chạy mỗi 1 phút để cập nhật nhanh, dọn phòng quá 5 phút)
function clearStaleServers() {
  let currentTime = Date.now();
  let staleThreshold = 5 * 60 * 1000;

  for (let category in apiData.jobs) {
    if (apiData.jobs.hasOwnProperty(category)) {
      apiData.jobs[category] = apiData.jobs[category].filter(server => {
        if (server && server.job_id) {
          let lastUpdate = serverTimestamps[server.job_id];
          return lastUpdate && (currentTime - lastUpdate) < staleThreshold;
        }
        return false;
      });
    }
  }
  
  for (let jobId in serverTimestamps) {
    if ((currentTime - serverTimestamps[jobId]) >= staleThreshold) {
      delete serverTimestamps[jobId];
    }
  }
}
setInterval(clearStaleServers, 60 * 1000); // 1 phút quét dọn 1 lần cho mượt

app.get('/api-data', (req, res) => {
  res.json(apiData);
});

// Endpoint /push siêu bảo mật kèm HMAC độc quyền của ông
app.post('/push', (req, res) => {
  try {
    let { job, players, sea, tags, current_boss, signature, timestamp } = req.body;

    if (!job || players === undefined || sea === undefined) {
      return res.status(400).json({ success: false, message: 'Thieu du lieu bat buoc' });
    }

    // Xác thực Replay Attack (Thời gian lệch không quá 30 giây)
    if (timestamp) {
      let currentTime = Date.now();
      let requestTime = parseInt(timestamp);
      if (Math.abs(currentTime - requestTime) > 30000) {
        return res.status(403).json({ success: false, message: 'Request qua han' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Thieu timestamp chống phá hoại' });
    }

    // Xác thực chữ ký HMAC
    if (signature) {
      let dataToVerify = job + "|" + players + "|" + sea + "|" + timestamp;
      if (!verifyHMAC(dataToVerify, signature)) {
        return res.status(403).json({ success: false, message: 'Chu ky khong hop le' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Thieu chu ky xac thuc' });
    }

    // Tiến hành giải mã đa lớp
    let originalJobId;
    if (job.startsWith(AUTH_PREFIX)) {
      let encryptedPart = job.substring(AUTH_PREFIX.length);
      originalJobId = multiLayerDecrypt(encryptedPart);
    } else {
      return res.status(403).json({ success: false, message: 'Xac thuc tien to that bai' });
    }

    if (!originalJobId || originalJobId.length === 0) {
      return res.status(400).json({ success: false, message: 'Giai ma thong tin that bai' });
    }

    classifyAndUpdateServer({
      job_id: originalJobId,
      players: players,
      sea: sea,
      tags: tags || [],
      current_boss: currentBoss || ''
    });
    
    return res.status(200).json({ success: true, message: 'OK' });

  } catch (error) {
    console.error('Loi Endpoint Push:', error);
    return res.status(500).json({ success: false, message: 'Loi server' });
  }
});

// Endpoint dự phòng /update (Cũng nâng cấp lên giải mã đa lớp luôn để đồng bộ script mới)
app.post('/update', (req, res) => {
  try {
    let { job, players, sea, tags, current_boss } = req.body;

    if (!job || players === undefined || sea === undefined) {
      return res.status(400).json({ success: false, message: 'Thieu du lieu' });
    }

    let originalJobId;
    if (job.startsWith(AUTH_PREFIX)) {
      let encryptedPart = job.substring(AUTH_PREFIX.length);
      originalJobId = multiLayerDecrypt(encryptedPart); // Fix lỗi giải mã đa tầng tại đây
    } else {
      return res.status(403).json({ success: false, message: 'Xac thuc that bai' });
    }

    classifyAndUpdateServer({
      job_id: originalJobId,
      players: players,
      sea: sea,
      tags: tags || [],
      current_boss: currentBoss || ''
    });
    
    return res.status(200).json({ success: true, message: 'OK' });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Loi server' });
  }
});

app.listen(port, () => {
  console.log(`Vexz API Server dang chay hoan hao tai port ${port}`);
});
 
