import ytdl from '@distube/ytdl-core';
import chalk from 'chalk';
import yts from 'yt-search';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import axios from 'axios';

export default async function Download(url, downloadpath, format, subtitles) {
    const regex = /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/;
    let filename;
    
    // Extract video ID from URL
    if (url.match(regex) !== null) {
      let id = url.match(regex)[1];
      let r = await yts({ videoId: id });
      filename = r.title.replace("/", " ");
    }

    if (!fs.existsSync(downloadpath)) {
      console.error(chalk.red("Path does not exist."));
      return;
    }

    console.log(`${chalk.green("Downloading")} ${chalk.cyan(`${filename}.${format}`)}`);
    
    const outputFilePath = path.join(downloadpath, `${filename}.${format}`);
    const tempOutputPath = path.join(downloadpath, `${filename}-temp.${format}`);

    // Fetch video and subtitle information
    const video = ytdl(url, {
      quality: "highest",
      filter: "audioandvideo",
    });

    const videoInfo = await ytdl.getInfo(url);
    const tracks = videoInfo.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    let subtitlePath;
    if (subtitles && tracks && tracks.length > 0) {
      const track = tracks.find(t => t.languageCode === subtitles);
      if (track) {
        console.log(chalk.green(`Found subtitle: ${track.name.simpleText}`));
        const subtitlesUrl = `${track.baseUrl}&fmt=vtt`;
        const subtitleResponse = await axios.get(subtitlesUrl);
        subtitlePath = path.join(downloadpath, `${filename}.vtt`);
        fs.writeFileSync(subtitlePath, subtitleResponse.data);
        console.log('Subtitles downloaded successfully!');
      }
    }

    let starttime;

    // Download the video to a temporary file (without converting yet)
    const downloadStream = fs.createWriteStream(tempOutputPath);

    video.pipe(downloadStream);
    
    // Start download timer
    video.once('response', () => {
      starttime = Date.now();
    });
    
    // Download progress
    video.on('progress', (chunkLength, downloaded, total) => {
      const percent = downloaded / total;
      const downloadedMinutes = (Date.now() - starttime) / 1000 / 60;
      const estimatedDownloadTime = (downloadedMinutes / percent) - downloadedMinutes;
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${chalk.yellow((percent * 100).toFixed(2) + "%")} ${chalk.green("downloaded")} `);
      process.stdout.write(`(${chalk.yellow((downloaded / 1024 / 1024).toFixed(2) + "MB")} of ${chalk.green((total / 1024 / 1024).toFixed(2) + "MB")})\n`);
      process.stdout.write(`running for: ${chalk.yellow(downloadedMinutes.toFixed(2)) + " minutes"}`);
      process.stdout.write(`, ${chalk.yellow(`estimated time left: ${estimatedDownloadTime.toFixed(2)} minutes`)} `);
      readline.moveCursor(process.stdout, 0, -1);
    });

    video.on('end', async () => {
      process.stdout.write('\n\n');
      process.stdout.write(chalk.green(`Download complete. Converting to ${format}\n\n`));

      try {
        // Convert the file and embed subtitles if they exist
        if (subtitlePath) {
          ffmpeg(tempOutputPath)
            .outputOptions('-vf', `subtitles=${subtitlePath}`)
            .save(outputFilePath)
            .on('end', () => {
              console.log(chalk.green(`Video saved: ${outputFilePath}`));
              fs.unlinkSync(tempOutputPath); // Clean up temp files
              fs.unlinkSync(subtitlePath);
            });
        } else {
          ffmpeg(tempOutputPath)
            .save(outputFilePath)
            .on('end', () => {
              console.log(chalk.green(`Conversion successful: ${outputFilePath}`));
              fs.unlinkSync(tempOutputPath); // Clean up temp file
            });
        }
      } catch (error) {
        console.error(chalk.red(`Error during conversion: ${error.message}`));
      }
    });

    video.on('error', (err) => {
      console.error(err);
    });
}

async function convertFile(inputFile, outputFile, ext) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .toFormat(ext)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputFile); // Save to the final output path
    });
}
