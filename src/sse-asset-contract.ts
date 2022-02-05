/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
@Info({title: 'SseContract', description: 'Smart Contract for Symmetric Searchable Encrypted Asset (SseAsset)' })
export class SseContract extends Contract {

    // -------- CURD -------- //

    @Transaction(false)
    @Returns('boolean')
    public async exists(ctx: Context, key: string): Promise<boolean> {
        const data: Uint8Array = await ctx.stub.getState(key);
        return (!!data && data.length > 0);
    }

    @Transaction(false)
    @Returns('string')
    public async read(ctx: Context, key: string): Promise<string> {
        const exists: boolean = await this.exists(ctx, key);
        if (!exists) {
            throw new Error(`The sse asset ${key} does not exist`);
        }
        const data: Uint8Array = await ctx.stub.getState(key);
        return data.toString();
    }

    @Transaction()
    public async write(ctx: Context, key: string, value: string): Promise<void> {
        const buffer: Buffer = Buffer.from(value);
        await ctx.stub.putState(key, buffer);
    }

    @Transaction()
    public async delete(ctx: Context, key: string): Promise<void> {
        const exists: boolean = await this.exists(ctx, key);
        if (!exists) {
            throw new Error(`The sse asset ${key} does not exist`);
        }
        await ctx.stub.deleteState(key);
    }

    // -------- EncryptedSegment -------- //

    @Transaction()
    public async storeEncryptedSegment(ctx: Context, segmentKey: string, segmentValue: string): Promise<void> {
        const key = "ct_" + segmentKey;

        const exists: boolean = await this.exists(ctx, key);
        if (exists) {
            throw new Error(`The sse asset segment with the key: "${key}" already exists`);
        }
        const buffer: Buffer = Buffer.from(segmentValue);
        return ctx.stub.putState(key, new Uint8Array(buffer));
    }

    @Transaction()
    public async storeEncryptedSegments(ctx: Context, segmentsKeyStr: string, segmentsValueStr: string): Promise<void> {
        const segmentsKey: string[] = JSON.parse(segmentsKeyStr);
        const segmentsValue: string[] = JSON.parse(segmentsValueStr);

        if(segmentsKey.length != segmentsValue.length) 
            throw new Error(`The keys list doesn't match values list.`);

        for(let i = 0; i < segmentsKey.length; i++) {
            await this.storeEncryptedSegment(ctx, segmentsKey[i], segmentsValue[i]);
        }
    }

    /**
     * 
     * @param ctx 
     * @param segmentsStringified stringified json object if format {key, value}[]
     */
    @Transaction()
    public async storeEncryptedSegmentsJSON(ctx: Context, segmentsStringified: string): Promise<void> {
        const segments: {pointer: string, data: string}[] = JSON.parse(segmentsStringified);

        for(const {pointer, data} of segments) {
            await this.storeEncryptedSegment(ctx, pointer, data);
        }
    }

    @Transaction()
    public async updateEncryptedSegment(ctx: Context, segmentKey: string, segmentValue: string): Promise<void> {
        const key = "ct_" + segmentKey;

        const exists: boolean = await this.exists(ctx, key);
        if (!exists) {
            throw new Error(`The sse asset segment with the key: "${key}" doesn't exists`);
        }

        await this.write(ctx, key, segmentValue);
    }

    @Transaction()
    public async deleteEncryptedSegment(ctx: Context, segmentKey: string): Promise<void> {
        const key = "ct_" + segmentKey;
        await this.delete(ctx, key);
    }


    // -------- Index -------- //

    @Transaction()
    public async addIndex(ctx: Context, indexHash: string, indexPointersStr: string): Promise<void> {
        const indexPointers: string[] = JSON.parse(indexPointersStr);
        const key = "ix_" + indexHash;

        const exists: boolean = await this.exists(ctx, key);
        if (exists) {
            const currPointers: string[] = JSON.parse(await this.read(ctx, key));
            const newPointers: string[] = [...currPointers, ...indexPointers];  //merge without duplicates
            await this.write(ctx, key, JSON.stringify(newPointers));
        } else {
            await this.write(ctx, key, JSON.stringify(indexPointers));
        }
    }

    @Transaction()
    public async addIndices(ctx: Context, indicesHashsStr: string, indicesPointersStr: string): Promise<void> {
        const indicesHashs: string[] = JSON.parse(indicesHashsStr)
        const indicesPointers: string[][] = JSON.parse(indicesPointersStr)

        if(indicesHashs.length != indicesPointers.length) 
            throw new Error(`The keys list doesn't match values list.`);

        for(let i = 0; i < indicesHashs.length; i++) {
            await this.addIndex(ctx, indicesHashs[i], JSON.stringify(indicesPointers[i]));
        }
    }

    /**
     * accept stringified JSON format for indices
     * @param ctx 
     * @param {{hash: string,  pointers: string[]}[]} indicesStringified stringified JSON format of type {hash: string,  pointers: string[]}[]
     * @param indicesPointersStr 
     */
    @Transaction()
    public async addIndicesJSON(ctx: Context, indicesStringified: string): Promise<void> {
        const indices: {hash: string, pointers: string[]}[] = JSON.parse(indicesStringified)

        for(const {hash, pointers} of indices) {
            const key = "ix_" + hash;
    
            const exists: boolean = await this.exists(ctx, key);
            if (exists) {
                const currPointers: string[] = JSON.parse(await this.read(ctx, key));
                const newPointers: string[] = [...currPointers, ...pointers];  //merge without duplicates
                await this.write(ctx, key, JSON.stringify(newPointers));
            } else {
                await this.write(ctx, key, JSON.stringify(pointers));
            }
        }
    }

    // -------- 

    @Transaction()
    public async store(ctx: Context, segmentsKey: string, segmentsValue: string, indicesHashs: string, indicesPointers: string): Promise<void> {
        const p1 = this.storeEncryptedSegments(ctx, segmentsKey, segmentsValue);
        const p2 = this.addIndices(ctx, indicesHashs, indicesPointers);
        await Promise.all([p1, p2]);
    }

    @Transaction()
    public async storeJSON(ctx: Context, segmentsStringified: string, indicesStringified: string): Promise<void> {
        const p1 = this.storeEncryptedSegmentsJSON(ctx, segmentsStringified);
        const p2 = this.addIndicesJSON(ctx, indicesStringified);
        await Promise.all([p1, p2]);
    }

    @Transaction(false)
    @Returns('string[]')
    public async search(ctx: Context, indexHash: string): Promise<string[]> {

        let keywords = indexHash.split(' ');
        let pointers: string[] = [];

        for(let keyword of keywords) {
            const key = "ix_" + keyword;

            const exists: boolean = await this.exists(ctx, key);
            if (!exists) continue;
            
            const data: Uint8Array = await ctx.stub.getState(key);
            pointers = [...new Set([...pointers, ...JSON.parse(data.toString())])];   //merge unique
        }

        const encryptedValues = pointers.map(async p => {
            let key = 'ct_' + p;
            const exists: boolean = await this.exists(ctx, key);
            if (!exists) {
                throw new Error(`[500] An encrypted file with the key: ${key} is missing`);
            }
            const data: Uint8Array = await ctx.stub.getState(key);
            return data.toString();
        });
        
        return await Promise.all(encryptedValues);
    }

    @Transaction(false)
    @Returns('SseAsset[]')
    public async readAll(ctx: Context) {
        const allResults = [];
        // range query with empty string for startKey and endKey does an open-ended query of all assets in the chaincode namespace.
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            const encryptedSegmentValue = Buffer.from(result.value.value.toString()).toString('utf8');
            allResults.push(encryptedSegmentValue);
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }

}
