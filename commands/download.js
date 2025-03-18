import ytdl from "@distube/ytdl-core";
import chalk from "chalk";
import inquirer from "inquirer";
import yts from "yt-search";
import InquirerFuzzyPath from "inquirer-fuzzy-path";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import os from "os";
import readline from "readline";
import path from "path";
inquirer.registerPrompt("fuzzypath", InquirerFuzzyPath);

export default async function Download() {
  try {
    let options = {
      filename: "",
      url: "",
      path: "",
      extension: "",
    };
    const regex = /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/;
    const home = os.homedir();
    const answer = await inquirer.prompt({
      name: "source",
      message: chalk.blue("Input query or video URL"),
    });

    if (answer.source.match(regex) !== null) {
      let url = answer.source.match(regex)[1];
      options.url = answer.source;
      let r = await yts({ videoId: url });
      options.filename = r.title.replace("/", " ");
    } else {
      let r = await yts(answer.source);
      let results = r.videos.slice(0, 5);
      let titles = results.map((video) => video.title);
      const videoAnswer = await inquirer.prompt({
        name: "video",
        type: "list",
        choices: titles,
        message: chalk.blue("Select one of the results"),
      });

      results.forEach((video) => {
        if (videoAnswer.video === video.title) {
          options.url = video.url;
          options.filename = video.title.replace(/["\/()]/g, "");
        }
      });
    }

    const pathAnswer = await inquirer.prompt({
      name: "path",
      type: "fuzzypath",
      rootPath: home,
      depthLimit: 2,
      excludePath: (p) =>
        p.startsWith("node_modules") ||
        p.includes(".") ||
        p.includes("AppData") ||
        p.toLowerCase().includes("programfiles"),
      excludeFilter: (nodePath) => nodePath === ".",
      itemType: "any",
      message: chalk.blue("Select download path"),
    });

    options.path = pathAnswer.path;

    if (!fs.existsSync(options.path)) {
      console.error(chalk.red("Path does not exist."));
      return;
    }

    const extensionAnswer = await inquirer.prompt({
      name: "extension",
      type: "list",
      choices: ["mp3", "mp4", "flac", "wav", "mov"],
      message: chalk.blue("Select download extension"),
    });

    options.extension = extensionAnswer.extension;
    console.log(
      `${chalk.green("Downloading")} ${chalk.cyan(`${options.filename}.${options.extension}`)}`,
    );
    await DownloadVideo(options);
  } catch (err) {
    console.error(err);
  }
}

async function DownloadVideo(options) {
  const outputFilePath = path.join(
    options.path,
    `${options.filename}.${options.extension}`,
  );
  const tempOutputPath = path.join(
    options.path,
    `${options.filename}-temp.${options.extension}`,
  );

  const video = ytdl(options.url, {
    quality: "highest",
    filter: "audioandvideo",
  });

  let starttime;

  // Download the video to a temporary file (without converting yet)
  const downloadStream = fs.createWriteStream(tempOutputPath);

  video.pipe(downloadStream);

  video.once("response", () => {
    starttime = Date.now();
  });

  video.on("progress", (chunkLength, downloaded, total) => {
    const percent = downloaded / total;
    const downloadedMinutes = (Date.now() - starttime) / 1000 / 60;
    const estimatedDownloadTime =
      downloadedMinutes / percent - downloadedMinutes;
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `${chalk.yellow((percent * 100).toFixed(2) + "%")} ${chalk.green("downloaded")} `,
    );
    process.stdout.write(
      `(${chalk.yellow((downloaded / 1024 / 1024).toFixed(2) + "MB")} of ${chalk.green((total / 1024 / 1024).toFixed(2) + "MB")})\n`,
    );
    process.stdout.write(
      `running for: ${chalk.yellow(downloadedMinutes.toFixed(2)) + " minutes"}`,
    );
    process.stdout.write(
      `, ${chalk.yellow(`estimated time left: ${estimatedDownloadTime.toFixed(2)} minutes`)} `,
    );
    readline.moveCursor(process.stdout, 0, -1);
  });

  video.on("end", async () => {
    process.stdout.write("\n\n");
    process.stdout.write(
      chalk.green(`Download complete. Converting to ${options.extension}\n\n`),
    );

    try {
      // Convert the file from the temporary format to the final output format
      await convertFile(tempOutputPath, outputFilePath, options.extension);
      // Optionally, remove the temporary file after conversion
      fs.unlinkSync(tempOutputPath);
      console.log(chalk.green(`Conversion successful: ${outputFilePath}`));
    } catch (error) {
      console.error(chalk.red(`Error during conversion: ${error.message}`));
    }
  });

  video.on("error", (err) => {
    console.error(err);
  });
}

async function convertFile(inputFile, outputFile, ext) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .toFormat(ext)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputFile); // Save to the final output path
  });
}
