const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const app = express();

app.use(express.json());
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data.json');

// 确保 uploads 目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const category = req.body.category || '未分类';
        const categoryDir = path.join(UPLOADS_DIR, category);
        
        // 确保分类目录存在
        if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
        }
        
        cb(null, categoryDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

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

// 获取视频列表（带分类信息）
app.get('/api/videos', (req, res) => {
    const videosWithInfo = [];
    
    // 读取上传目录下的所有分类目录
    fs.readdir(UPLOADS_DIR, (err, categories) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json([]);
        }
        
        let processedCategories = 0;
        
        categories.forEach(category => {
            const categoryDir = path.join(UPLOADS_DIR, category);
            
            // 检查是否是目录
            fs.stat(categoryDir, (err, stats) => {
                if (!err && stats.isDirectory()) {
                    // 读取分类目录下的视频文件
                    fs.readdir(categoryDir, (err, files) => {
                        if (!err) {
                            const videos = files.filter(f => f.toLowerCase().endsWith('.mp4'));
                            videos.forEach(video => {
                                videosWithInfo.push({
                                    filename: video,
                                    category: category
                                });
                            });
                        }
                        
                        processedCategories++;
                        if (processedCategories === categories.length) {
                            res.json(videosWithInfo);
                        }
                    });
                } else {
                    processedCategories++;
                    if (processedCategories === categories.length) {
                        res.json(videosWithInfo);
                    }
                }
            });
        });
        
        // 处理空目录情况
        if (categories.length === 0) {
            res.json(videosWithInfo);
        }
    });
});

// 获取分类列表
app.get('/api/categories', (req, res) => {
    fs.readdir(UPLOADS_DIR, (err, items) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json(['未分类']);
        }
        
        const categories = [];
        let processedItems = 0;
        
        items.forEach(item => {
            const itemPath = path.join(UPLOADS_DIR, item);
            fs.stat(itemPath, (err, stats) => {
                if (!err && stats.isDirectory()) {
                    categories.push(item);
                }
                
                processedItems++;
                if (processedItems === items.length) {
                    // 确保至少包含'未分类'分类
                    if (!categories.includes('未分类')) {
                        categories.push('未分类');
                    }
                    res.json(categories);
                }
            });
        });
        
        // 处理空目录情况
        if (items.length === 0) {
            res.json(['未分类']);
        }
    });
});

// 为视频设置分类
app.post('/api/set-category', (req, res) => {
    const { videoId, category } = req.body;
    if (!videoId || !category) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    // 查找视频文件的当前位置
    fs.readdir(UPLOADS_DIR, (err, categories) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json({ error: '分类设置失败，请稍后重试' });
        }

        let found = false;
        let currentCategory = null;
        
        // 遍历所有分类目录查找视频
        const checkCategory = (index) => {
            if (index >= categories.length) {
                if (!found) {
                    return res.status(404).json({ error: '视频文件不存在' });
                }
                return;
            }

            const cat = categories[index];
            const catDir = path.join(UPLOADS_DIR, cat);
            
            fs.stat(catDir, (err, stats) => {
                if (!err && stats.isDirectory()) {
                    fs.readdir(catDir, (err, files) => {
                        if (!err && files.includes(videoId)) {
                            found = true;
                            currentCategory = cat;
                            
                            // 如果分类没有变化，直接返回成功
                            if (currentCategory === category) {
                                return res.json({ success: true });
                            }
                            
                            // 确保目标分类目录存在
                            const targetDir = path.join(UPLOADS_DIR, category);
                            if (!fs.existsSync(targetDir)) {
                                fs.mkdirSync(targetDir, { recursive: true });
                            }
                            
                            // 移动视频文件
                            const oldPath = path.join(catDir, videoId);
                            const newPath = path.join(targetDir, videoId);
                            
                            fs.rename(oldPath, newPath, (err) => {
                                if (err) {
                                    console.error('移动视频文件失败:', err);
                                    return res.status(500).json({ error: '分类设置失败，请稍后重试' });
                                }
                                
                                // 同时移动封面文件（如果存在）
                                const coverOldPath = path.join(catDir, videoId.replace(/\.mp4$/i, '.jpg'));
                                const coverNewPath = path.join(targetDir, videoId.replace(/\.mp4$/i, '.jpg'));
                                
                                if (fs.existsSync(coverOldPath)) {
                                    fs.rename(coverOldPath, coverNewPath, (err) => {
                                        if (err) {
                                            console.error('移动封面文件失败:', err);
                                        }
                                        res.json({ success: true });
                                    });
                                } else {
                                    res.json({ success: true });
                                }
                            });
                        } else {
                            checkCategory(index + 1);
                        }
                    });
                } else {
                    checkCategory(index + 1);
                }
            });
        };
        
        checkCategory(0);
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

// 生成视频封面
function generateVideoCover(videoPath, coverPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                count: 1,
                timestamps: ['5%'], // 从视频的5%处截取
                filename: path.basename(coverPath),
                folder: path.dirname(coverPath),
                size: '640x360' // 封面尺寸
            })
            .on('end', () => {
                console.log(`封面生成成功: ${coverPath}`);
                resolve(coverPath);
            })
            .on('error', (err) => {
                console.error('封面生成失败:', err);
                reject(err);
            });
    });
}

// 上传视频
app.post('/api/upload', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的视频文件' });
    }
    
    try {
        // 生成封面
        const videoPath = req.file.path;
        const coverPath = path.join(path.dirname(videoPath), req.file.originalname.replace(/\.mp4$/i, '.jpg'));
        await generateVideoCover(videoPath, coverPath);
        
        res.json({ success: true, filename: req.file.originalname });
    } catch (error) {
        console.error('上传处理失败:', error);
        res.json({ success: true, filename: req.file.originalname, warning: '视频上传成功，但封面生成失败' });
    }
});

// 获取视频统计信息
app.get('/api/stats', (req, res) => {
    let totalVideos = 0;
    const categories = new Set();
    
    fs.readdir(UPLOADS_DIR, (err, items) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json({ totalVideos: 0, totalCategories: 0 });
        }
        
        let processedItems = 0;
        
        items.forEach(item => {
            const itemPath = path.join(UPLOADS_DIR, item);
            fs.stat(itemPath, (err, stats) => {
                if (!err && stats.isDirectory()) {
                    categories.add(item);
                    
                    // 读取分类目录下的视频文件
                    fs.readdir(itemPath, (err, files) => {
                        if (!err) {
                            const videos = files.filter(f => f.toLowerCase().endsWith('.mp4'));
                            totalVideos += videos.length;
                        }
                        
                        processedItems++;
                        if (processedItems === items.length) {
                            res.json({
                                totalVideos: totalVideos,
                                totalCategories: categories.size
                            });
                        }
                    });
                } else {
                    processedItems++;
                    if (processedItems === items.length) {
                        res.json({
                            totalVideos: totalVideos,
                            totalCategories: categories.size
                        });
                    }
                }
            });
        });
        
        // 处理空目录情况
        if (items.length === 0) {
            res.json({
                totalVideos: 0,
                totalCategories: 0
            });
        }
    });
});

// 启动服务
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`服务器启动`);
});