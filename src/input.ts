//original: https://github.com/stephen/audio-mixer

import {Writable, WritableOptions} from "stream";

export type InputOptions = {
	writableOption: WritableOptions,
	channels: 1 | 2,
	sampleRate: number,
	volume: number,
	bitDepth: number,
}

const defaultInputOptions: InputOptions = {
	writableOption: {},
	channels: 2,
	sampleRate: 44100,
	volume: 100,
	bitDepth: 16
}

export default class Input extends Writable{
	option: InputOptions;
	buffer: Buffer;
	private readSample: (offset?: number) => number;
	private writeSample: (value: number, offset?: number) => number;
	private sampleByteLength: number;
	private getMoreData: Function | null;
	private enable: boolean;

	constructor(opt?: Partial<InputOptions>){
		const option = {...defaultInputOptions, ...opt};

		super(option.writableOption);

		if(option.volume < 0) option.volume = 0;
		if(100 < option.volume) option.volume = 100;

		this.option = option;
		this.buffer = Buffer.alloc(0);

		if(option.bitDepth === 8){
			this.readSample = this.buffer.readInt8;
			this.writeSample = this.buffer.writeInt8;
			this.sampleByteLength = 1;
		}else if(option.bitDepth === 32){
			this.readSample = this.buffer.readInt32LE;
			this.writeSample = this.buffer.writeInt32LE;
			this.sampleByteLength = 4;
		}else{
			this.option.bitDepth = 16;
			this.readSample = this.buffer.readInt16LE;
			this.writeSample = this.buffer.writeInt16LE;
			this.sampleByteLength = 2;
		}

		this.enable = true;

		this.getMoreData = null;
	}

	read(samples: number){
		const bytes = Math.min(samples * (this.option.bitDepth / 8) * this.option.channels, this.buffer.length);
		const result = this.buffer.slice(0, bytes);
		this.buffer = this.buffer.slice(bytes);

		if(this.buffer.length <= 131072 && this.getMoreData !== null) {
			const getMoreData = this.getMoreData;
			this.getMoreData = null;
			process.nextTick(getMoreData);
		}
		for(let i = 0; i < result.length; i += 2) {
			result.writeInt16LE(Math.round(this.option.volume * result.readInt16LE(i) / 100), i);
		}

		return result;
	}

	readMono(samples: number){
		if(this.option.channels === 1){
			return this.read(samples);
		}

		// This function will be overridden by this.read, if input already is mono.
		const stereoBuffer = this.read(samples);
		// var monoBuffer = new Buffer(stereoBuffer.length / 2);
		const monoBuffer = Buffer.alloc(stereoBuffer.length / 2)
		const s = this.availSamples(stereoBuffer.length);

		for (let i = 0; i < s; i++) {
			const l = this.readSample.call(stereoBuffer, i * this.sampleByteLength * 2);
			const r = this.readSample.call(stereoBuffer, (i * this.sampleByteLength * 2) + this.sampleByteLength);
			this.writeSample.call(monoBuffer, Math.round((l + r) / 2), i * this.sampleByteLength);
		}
		return monoBuffer;
	}

	readStereo(samples: number){
		if(this.option.channels === 2){
			return this.read(samples);
		}

		// This function will be overridden by this.read, if input already is stereo.
		const monoBuffer = this.read(samples);
		// var stereoBuffer = new Buffer(monoBuffer.length * 2);
		const stereoBuffer = Buffer.alloc(monoBuffer.length * 2);
		const s = this.availSamples(monoBuffer.length);
		for (let i = 0; i < s; i++) {
			const m = this.readSample.call(monoBuffer, i * this.sampleByteLength);
			this.writeSample.call(stereoBuffer, m, i * this.sampleByteLength * 2);
			this.writeSample.call(stereoBuffer, m, (i * this.sampleByteLength * 2) + this.sampleByteLength);
		}
		return stereoBuffer;
	}

	availSamples(length: number = this.buffer.length){
		return Math.floor(length / ((this.option.bitDepth / 8) * this.option.channels));
	}

	_write(chunk: any, encoding: BufferEncoding, next: (error?: (Error | null)) => void){
		/*
	  if (!Buffer.isBuffer(chunk)) {
	    chunk = new Buffer(chunk, encoding);
	  }
	  */
		this.buffer = Buffer.concat([this.buffer, chunk]);
		if(this.buffer.length > 131072) {
			this.getMoreData = next;
		}else{
			next();
		}
	}

	setVolume(volume: number){
		this.option.volume = Math.max(Math.min(volume, 100), 0);
	}

	getVolume(){
		return this.option.volume;
	}

	setEnabled(enable: boolean){
		this.enable = enable;
	}

	isEnabled(){
		return this.enable;
	}

}