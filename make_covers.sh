#!/bin/bash
# 进入视频目录
cd /root/psvideo/uploads

# 遍历所有 mp4 文件
for video in *.mp4; do
    # 获取不带后缀的文件名
    filename="${video%.*}"
    
    # 如果对应的 jpg 不存在，则截图
    if [ ! -f "${filename}.jpg" ]; then
        echo "正在为 $video 生成封面..."
        # 截取视频5分钟的那一帧
        ffmpeg -i "$video" -ss 00:01:00 -vframes 1 "${filename}.jpg" -y -loglevel quiet
    fi
done
echo "所有封面处理完成！"
