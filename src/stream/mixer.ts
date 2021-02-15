//original: https://github.com/stephen/audio-mixer

import Input, {InputOptions} from "./input";
import {Readable, ReadableOptions} from "stream";

export type MixerOptions = {
	readableOption: ReadableOptions,
	channels: 1 | 2,
	sampleRate: number,
	bitDepth: number,
}

const defaultMixerOption: MixerOptions = {
	readableOption: {},
	channels: 2,
	sampleRate: 44100,
	bitDepth: 16,
}

export default class Mixer extends Readable{
	option: MixerOptions;
	buffer: Buffer;
	private readSample: (offset?: number) => number;
	private writeSample: (value: number, offset?: number) => number;
	private sampleByteLength: number;
	private inputs: Input[];


	constructor(opt?: Partial<MixerOptions>){
		const option = {...defaultMixerOption, ...opt};

		super(option.readableOption);

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

		this.inputs = [];

	}

	_read(size: number){

		let samples = Number.MAX_VALUE;

		let enableFilter = this.inputs.filter(input => input.isActive());
		enableFilter.forEach(input => {
			const as = input.availSamples();
			if (as < samples) samples = as;
		});

		if(samples > 0 && samples != Number.MAX_VALUE) {

			// var mixedBuffer = new Buffer(samples * this.sampleByteLength * this.channels);
			const mixedBuffer = Buffer.alloc(samples * this.sampleByteLength * this.option.channels);
			mixedBuffer.fill(0);

			enableFilter.forEach(input => {
				const inputBuffer = this.option.channels == 1 ? input.readMono(samples) : input.readStereo(samples);

				for (let i = 0; i < samples * this.option.channels; i++) {
					const sample = this.readSample.call(mixedBuffer, i * this.sampleByteLength) + Math.round(this.readSample.call(inputBuffer, i * this.sampleByteLength) / this.inputs.length);
					this.writeSample.call(mixedBuffer, sample, i * this.sampleByteLength);
				}
			})

			this.push(mixedBuffer);
		} else {
			setImmediate(this._read.bind(this));
		}
	}

	input(opt?: Partial<InputOptions>){
		const input = new Input(opt);
		this.inputs.push(input);

		return input;
	}
}