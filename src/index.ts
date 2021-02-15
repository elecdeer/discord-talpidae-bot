import {Readable, Transform, TransformCallback} from "stream";

require("dotenv").config();

import log4js from 'log4js';
import Discord, {Client, VoiceBroadcast, VoiceConnection} from "discord.js";
import { OpusEncoder } from '@discordjs/opus';

import Mixer from "./stream/mixer";

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

const encoder = new OpusEncoder(48000, 2);
const opusEncoder = new Transform({
	transform(chunk: any, encoding: string, done: TransformCallback): void {
		// logger.debug(chunk);
		// logger.debug(chunk.length);
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

	voiceChannel.members.forEach(member => {
		if(member.user === clientA.user) return;
		logger.info(`member: ${member.user.username}`);
		const audioStream = receiver.createStream(member.user, { mode: 'pcm' , end: "manual"});

		mixerInputs[member.user.id] = mixer.input({
			sampleRate: 48000,
			channels: 2,
			bitDepth: 16,
		});
		audioStream.pipe(mixerInputs[member.user.id]);

	})


	connectionA.on('speaking', (user, speaking) => {
		if(speaking.bitfield > 0){
			logger.debug(`speak on ${user.username}: ${speaking}`);

			mixerInputs[user.id].setEnabled(true);
		}else{
			logger.debug(`speak off ${user.username}: ${speaking}`);

			mixerInputs[user.id].setEnabled(false);
			//TODO
			//若干途切れるのはbuffer消化し切るのとspeak off走るタイミングの問題な気がする
			//mixerのstream側でやらないとだめか？
			//logに出るのが遅いだけ説もある
		}

	});


	connectionA.on("disconnect", () => {
		logger.info("disconnected");
	})

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
