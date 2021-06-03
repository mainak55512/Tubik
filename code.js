const express = require('express');
const { dialog } = require('electron')
const ytdl = require('ytdl-core')
const ffmpeg = require('ffmpeg-static')
const cp = require('child_process');
const fs = require('fs')
const path = require('path')
const app = express();
const homedir = require('os').homedir()
app.use(express.json());
app.use(express.static('public'));

app.get("/videoInfo", async (request, response) => {
    const videoURL = request.query.videoURL;
    const info = await ytdl.getInfo(videoURL);
    response.status(200).json(info);
});

app.get("/download", (request, response) => {
    const videoURL = request.query.videoURL;
    const itag = request.query.itag;

    dialog.showMessageBox({
        message: "Download Started...\nPlease don't close the app"
    })

    fs.access(path.join(homedir, "tubikDownloads"), err => {
        fs.mkdir(path.join(homedir, "tubikDownloads"), { recursive: true }, (err) => {
            if (err) {
                console.log(err)
            }
        })
    })

    fs.access(path.join(homedir, "tubikDownloads/video.mkv"), err => {
        if (err) {
            downCreate();
        } else {
            fs.unlink(path.join(homedir, "tubikDownloads/video.mkv"), () => {
                downCreate();
            })
        }
    })
    function downCreate() {
        const tracker = {
            start: Date.now(),
            audio: { downloaded: 0, total: Infinity },
            video: { downloaded: 0, total: Infinity },
            merged: { frame: 0, speed: '0x', fps: 0 },
        };
        const audio = ytdl(videoURL, { quality: 'highestaudio' })
            .on('progress', (_, downloaded, total) => {
                tracker.audio = { downloaded, total };
            });
        const video = ytdl(videoURL, {
            filter: format => format.itag == itag
        }).on('progress', (_, downloaded, total) => {
            tracker.video = { downloaded, total };
        });

        const ffmpegProcess = cp.spawn(ffmpeg, [
            // Remove ffmpeg's console spamming
            '-loglevel', '8', '-hide_banner',
            // Redirect/Enable progress messages
            '-progress', 'pipe:3',
            // Set inputs
            '-i', 'pipe:4',
            '-i', 'pipe:5',
            // Map audio & video from streams
            '-map', '0:a',
            '-map', '1:v',
            // Keep encoding
            '-c:v', 'copy',
            // Define output file
            `${homedir}/tubikDownloads/video.mkv`,
        ], {
            windowsHide: true,
            stdio: [
                /* Standard: stdin, stdout, stderr */
                'inherit', 'inherit', 'inherit',
                /* Custom: pipe:3, pipe:4, pipe:5 */
                'pipe', 'pipe', 'pipe',
            ],
        });
        ffmpegProcess.stdio[3].on('data', chunk => {
            // Start the progress bar
            // if (!progressbarHandle) progressbarHandle = setInterval(showProgress, progressbarInterval);
            // Parse the param=value list returned by ffmpeg
            const lines = chunk.toString().trim().split('\n');
            const args = {};
            for (const l of lines) {
                const [key, value] = l.split('=');
                args[key.trim()] = value.trim();
            }
            tracker.merged = args;
        });
        // response.header("Content-Disposition", 'attachment;\ filename="video.mkv"');
        audio.pipe(ffmpegProcess.stdio[4]);
        video.pipe(ffmpegProcess.stdio[5]);
        audio.on('end', () => {
            video.on('end', () => {
                dialog.showMessageBox({
                    message: "!!! Download Finished !!!"
                })
            })
        })
    }
});

app.listen(5000);