import {Readable, Transform, TransformCallback} from "stream";

require("dotenv").config();

import log4js from 'log4js';
import Discord, {Client, VoiceBroadcast, VoiceConnection} from "discord.js";
// const { OpusEncoder } = require('@discordjs/opus');
// import OpusEncoder from "@discordjs/opus";

import fs from "fs";
import { OpusEncoder } from '@discordjs/opus';

// opusEncoder.on("data", chunk => {
// 	logger.debug(chunk);
// })
import Mixer from "./mixer";
import stream = require("stream");

log4js.configure({
	appenders: {
		out: {type: "stdout"},
		app: {type: "file", filename: "talpidae.log"},
		wrapErr: {type: "logLevelFilter", appender: "app", level: "warn"}
	},
	categories: {
		default: {
			appenders: ["out", "app"],
			level: "all"
		},

	}
});

const logger = log4js.getLogger();

logger.info("start process");
logger.debug("environment", process.env);


export const clientA: Client = new Discord.Client();
export const clientB: Client = new Discord.Client();



clientA.login(process.env.DISCORD_TOKEN_A).then(res => {
	logger.info("bot login A");
	logger.info(`token: ${res}`);
});
clientB.login(process.env.DISCORD_TOKEN_B).then(res => {
	logger.info("bot login B");
	logger.info(`token: ${res}`);
});


let connectionA: VoiceConnection;
let connectionB: VoiceConnection;

let broadcast: VoiceBroadcast;


const encoder = new OpusEncoder(48000, 2);
const opusEncoder = new Transform({
	// highWaterMark: 100,
	// writableHighWaterMark: 100,
	// readableHighWaterMark: 100,
	transform(chunk: any, encoding: string, done: TransformCallback): void {
		logger.debug(chunk);
		logger.debug(chunk.length);
		if(chunk.length > 3840){

		}else{
			const encodedChunk = encoder.encode(chunk);
			this.push(encodedChunk) // データを下流のパイプに渡す処理
		}


		done() // 変形処理終了を伝えるために呼び出す
	},
})
const mixer = new Mixer({
	channels: 2,
})
mixer.pipe(opusEncoder);

const mixerInputs: Record<string, any> = {};

// mixer.on("data", (chunk: any) => {
// 	logger.debug(chunk.length);
//
// })
// mixer.on("pause", () => {
// 	logger.info(`mixer pause`);
// });
// mixer.on("resume", () => {
// 	logger.info(`mixer resume`);
// })
// mixer.on("end", () => {
// 	logger.info(`mixer end`);
// })



clientA.on('message', async message => {
	logger.info("on message");
	logger.debug(message.content);

	const voiceChannel = message?.member?.voice?.channel;

	if(!voiceChannel){
		logger.info("voice channel unconnected")
		return;
	}
	if(!message.content.startsWith("talpidaeFrom")) return;
	if(!clientA.user) return;

	logger.info("try connect");

	connectionA = await voiceChannel?.join();

	if(!connectionA){
		return;
	}
	if(!message.member) return;

	logger.info("record " + voiceChannel.id);

	const receiver = connectionA.receiver;

	const userAudioStream: Record<string, Readable> = {};

	voiceChannel.members.forEach(member => {
		if(member.user === clientA.user) return;
		logger.info(`member: ${member.user.username}`);
		const audioStream = receiver.createStream(member.user, { mode: 'pcm' , end: "manual"});

		userAudioStream[member.user.id] = audioStream;
		// audioStream.pipe(opusEncoder);

		audioStream.on("data", (chunk) => {
			logger.info(`${member.user.username} data ${chunk.length}`);
			// audioStream.unpipe(mixerInputs[member.user.id]);
		});
		// audioStream.on("pause", () => {
		// 	logger.info(`${member.user.username} pause`);
		// });
		// audioStream.on("resume", () => {
		// 	logger.info(`${member.user.username} resume`);
		// 	// audioStream.pipe(mixerInputs[member.user.id]);
		// });
		// audioStream.on("end", () => {
		// 	logger.info(`${member.user.username} end`);
		// });
		// audioStream.on("close", () => {
		// 	logger.info(`${member.user.username} close`);
		// });
		//
		// audioStream.on("readable", () => {
		// 	logger.info(`${member.user.username} readable`);
		// });


	})


	connectionA.on('speaking', (user, speaking) => {
		if(speaking.bitfield > 0){
			logger.debug(`speak on ${user.username}: ${speaking}`);
			mixerInputs[user.id] = mixer.input({
				sampleRate: 48000,
				channels: 2,
				bitDepth: 16,
			});
			userAudioStream[user.id].pipe(mixerInputs[user.id]);
		}else{
			logger.debug(`speak off ${user.username}: ${speaking}`);


			//TODO
			//若干途切れるのはbuffer消化し切るのとspeak off走るタイミングの問題な気がする
			//mixerのstream側でやらないとだめか？
			//logに出るのが遅いだけ説もある

			mixer.inputs = mixer.inputs.filter((input: any) => input !== mixerInputs[user.id]);
			userAudioStream[user.id].unpipe(mixerInputs[user.id]);
			// setTimeout(() => {
			//
			// }, 1000);

		}

		// audioStream.unpipe(mixerInputs[member.user.id]);

	});


	connectionA.on("disconnect", () => {
		logger.info("disconnected");
	})

	// const audio = connection.receiver.createStream(message.member, { mode: 'pcm' });
	// audio.pipe(fs.createWriteStream('audio'));
});






clientB.on('message', async message => {
	logger.info("on message");
	logger.debug(message.content);

	const voiceChannel = message?.member?.voice?.channel;

	if(!voiceChannel){
		logger.info("voice channel unconnected")
		return;
	}
	if(!message.content.startsWith("talpidaeTo")) return;
	if(!clientB.user) return;

	logger.info("try connect");

	connectionB = await voiceChannel?.join();

	if(!clientB.voice){
		logger.error("clientB.voice undefined");
		return;
	}


	const dispatcher = connectionB.play(opusEncoder, {type: "opus"});
	dispatcher.on("finish", () => {
		logger.debug("finish");
	})

	// broadcast = clientB.voice?.createBroadcast();
	//
	// if(!connectionB){
	// 	return;
	// }
	// if(!message.member) return;
	//
	// logger.info("record " + voiceChannel.id);
	//
	// const receiver = connectionB.receiver;
	// //
	// connectionB.on('speaking', (user, speaking) => {
	// 	if(speaking) {
	// 		logger.debug(`${user.username} started speaking`);
	// 		const audioStream = receiver.createStream(user, { mode: 'opus' });
	// 		connectionB.play(audioStream, {type: "opus"});
	// 	}
	// });
	// connectionB.on("disconnect", () => {
	// 	logger.info("disconnected");
	// })
	//
	// // const audio = connection.receiver.createStream(message.member, { mode: 'pcm' });
	// // audio.pipe(fs.createWriteStream('audio'));
});




process.on("exit", function() {
	logger.info("Exit...");
	log4js.shutdown();
	clientA.destroy();
	clientB.destroy();
	logger.info("Destroy");
})
process.on("SIGINT", function () {
	process.exit(0);
});
