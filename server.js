const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data.json');

// 读取数据库文件
function getDB() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        return content ? JSON.parse(content) : {};
    } catch (e) {
        console.error('读取 data.json 失败:', e);
        return {};
    }
}

// 写入数据库文件
function saveDB(db) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
        console.log('数据已保存到 data.json');
        return true;
    } catch (e) {
        console.error('写入 data.json 失败:', e);
        return false;
    }
}

app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// 获取视频列表
app.get('/api/videos', (req, res) => {
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json([]);
        }
        res.json(files.filter(f => f.toLowerCase().endsWith('.mp4')));
    });
});

// 获取视频的评论和点赞数
app.get('/api/get-data', (req, res) => {
    const db = getDB();
    res.json(db[req.query.videoId] || { comments: [], likes: 0 });
});

// 添加评论
app.post('/api/add-comment', (req, res) => {
    const { videoId, content, user } = req.body;
    if (!videoId || !content || !user) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    const db = getDB();
    if (!db[videoId]) db[videoId] = { comments: [], likes: 0 };

    db[videoId].comments.push({
        user,
        content,
        time: new Date().toLocaleString('zh-CN', { hour12: false })
    });

    if (saveDB(db)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: '评论保存失败，请稍后重试' });
    }
});

// 点赞
app.post('/api/add-like', (req, res) => {
    const { videoId } = req.body;
    if (!videoId) {
        return res.status(400).json({ error: '缺少视频ID' });
    }

    const db = getDB();
    if (!db[videoId]) db[videoId] = { comments: [], likes: 0 };

    db[videoId].likes += 1;

    if (saveDB(db)) {
        res.json({ likes: db[videoId].likes });
    } else {
        res.status(500).json({ error: '点赞保存失败，请稍后重试' });
    }
});

// 启动服务
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`服务器启动`);
});