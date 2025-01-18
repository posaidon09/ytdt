#!/usr/bin/env node

const { Command } = require("commander");
const ytdl = require("@distube/ytdl-core");
const yts = require("yt-search");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const program = new Command();

program.name("ytdt").description("A CLI YouTube downloader.").version("1.0.0");

program
	.argument("<url>", "URL of the video you want to download")
	.argument("<path>", "Path for the video download")
	.argument("<format>", "Format for the video (example: mp3)")
	.argument(
		"[subtitles]",
		"Language for the video's subtitles, make sure to only use the first 2 letters such as 'en' (the video won't have subtitles if left blank or if there are no available subtitles)",
	)
	.action((url, path, format, subtitles) => {
		Download(url, path, format, subtitles);
	});

program.parse();

async function Download(url, downloadpath, format, subtitles) {
	const regex = /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/;
	let filename;

	// Extract video ID = URL
	if (url.match(regex) !== null) {
		let id = url.match(regex)[1];
		let r = await yts({ videoId: id });
		filename = r.title
			.replaceAll("/", "_")
			.replaceAll("'", "")
			.replaceAll('"', "")
			.replaceAll(":", "_")
			.replaceAll("\\", "_")
			.replaceAll("?", "")
			.replaceAll("*", "")
			.replaceAll("|", "-")
			.replaceAll("<", "")
			.replaceAll(">", "")
			.replaceAll("~", "-")
			.replaceAll(" ", "_");
	}

	if (!fs.existsSync(downloadpath)) {
		console.error("\x1b[31mPath does not exist.\x1b[0m");
		return;
	}

	console.log(
		`\x1b[32mDownloading\x1b[0m \x1b[36m${filename}.${format}\x1b[0m`,
	);

	const outputFilePath = path.join(downloadpath, `${filename}.${format}`);
	const tempOutputPath = path.join(downloadpath, `${filename}-temp.${format}`);

	// Fetch video and subtitle information
	const video = ytdl(url, {
		quality: "highest",
		filter: "audioandvideo",
	});

	const videoInfo = await ytdl.getInfo(url);
	const tracks =
		videoInfo.player_response.captions?.playerCaptionsTracklistRenderer
			?.captionTracks;

	let subtitlePath;
	if (subtitles && tracks && tracks.length > 0) {
		const track = tracks.find((t) => t.languageCode === subtitles);
		if (track) {
			console.log(`\x1b[32mFound subtitle: ${track.name.simpleText}\x1b[0m`);
			const subtitlesUrl = `${track.baseUrl}&fmt=vtt`;

			try {
				const response = await fetch(subtitlesUrl);
				if (!response.ok) {
					throw new Error(`Failed to fetch subtitles: ${response.statusText}`);
				}
				const subtitleData = await response.text();
				subtitlePath = path.join(downloadpath, `${filename}.vtt`);
				fs.writeFileSync(subtitlePath, subtitleData);
				console.log("Subtitles downloaded successfully!");
			} catch (error) {
				console.error(
					`\x1b[31mError downloading subtitles: ${error.message}\x1b[0m`,
				);
			}
		}
	}

	let starttime;

	// Download the video to a temporary file (without converting yet)
	const downloadStream = fs.createWriteStream(tempOutputPath);

	video.pipe(downloadStream);

	// Start download timer
	video.once("response", () => {
		starttime = Date.now();
	});

	// Download progress
	video.on("progress", (chunkLength, downloaded, total) => {
		const percent = downloaded / total;
		const downloadedMinutes = (Date.now() - starttime) / 1000 / 60;
		const estimatedDownloadTime =
			downloadedMinutes / percent - downloadedMinutes;
		readline.cursorTo(process.stdout, 0);
		process.stdout.write(
			`\x1b[33m${(percent * 100).toFixed(2) + "%"}\x1b[0m \x1b[32mdownloaded\x1b[0m `,
		);
		process.stdout.write(
			`(\x1b[33m${(downloaded / 1024 / 1024).toFixed(2) + "MB"}\x1b[0m of \x1b[32m${(total / 1024 / 1024).toFixed(2) + "MB"}\x1b[0m)\n`,
		);
		process.stdout.write(
			`running for: \x1b[33m${downloadedMinutes.toFixed(2)} minutes\x1b[0m`,
		);
		process.stdout.write(
			`, \x1b[33mestimated time left: ${estimatedDownloadTime.toFixed(
				2,
			)} minutes\x1b[0m `,
		);
		readline.moveCursor(process.stdout, 0, -1);
	});

	video.on("end", async () => {
		process.stdout.write("\n\n");
		process.stdout.write(
			`\x1b[32mDownload complete. Converting to ${format}\n\n\x1b[0m`,
		);

		try {
			// Convert the file and embed subtitles if they exist
			if (subtitlePath) {
				ffmpeg(tempOutputPath)
					.outputOptions("-vf", `subtitles=${subtitlePath}`)
					.save(outputFilePath)
					.on("end", () => {
						console.log(`\x1b[32mVideo saved: ${outputFilePath}\x1b[0m`);
						fs.unlinkSync(tempOutputPath); // Clean up temp files
						fs.unlinkSync(subtitlePath);
					});
			} else {
				ffmpeg(tempOutputPath)
					.save(outputFilePath)
					.on("end", () => {
						console.log(
							`\x1b[32mConversion successful: ${outputFilePath}\x1b[0m`,
						);
						fs.unlinkSync(tempOutputPath); // Clean up temp file
					});
			}
		} catch (error) {
			console.error(`\x1b[31mError during conversion: ${error.message}\x1b[0m`);
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
