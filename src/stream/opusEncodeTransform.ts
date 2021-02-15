import {Transform, TransformCallback} from "stream";
import {OpusEncoder} from "@discordjs/opus";


export class OpusEncodeTransform extends Transform{
	private encoder: OpusEncoder;

	constructor(){
		super();
		this.encoder = new OpusEncoder(48000, 2);
	}

	_transform(chunk: any, encoding: BufferEncoding, done: TransformCallback){
		super._transform(chunk, encoding, done);

		// logger.debug(chunk);
		// logger.debug(chunk.length);

		//この辺の閾値よくわからんけど動いてるのでヨシ！
		if(chunk.length > 3840){

		}else{
			const encodedChunk = this.encoder.encode(chunk);
			this.push(encodedChunk)
		}

		done()
	}
}