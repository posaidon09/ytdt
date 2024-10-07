#!/usr/bin/env node

import process from 'process';
process.removeAllListeners('warning');
import Download from './download.js';
import { Command } from 'commander';

const program = new Command()

program
.name('ytdt')
.description('A CLI youtube downloader.')
.version('1.0.0')

program
.argument('<url>', "URL of the video you want to download")
.argument('<path>', "Path for the video download")
.argument('<format>', "Format for the video (example: mp3)")
.argument('[subtitles]', "Language for the video's subtitles, make sure to only use the first 2 letters such as 'en' (the video won't have subtitles if left blank or if there are no available subtitles)")
.action((url, path, format, subtitles) => {
    Download(url, path, format, subtitles);
});

program.parse();
