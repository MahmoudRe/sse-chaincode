/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { Object, Property } from 'fabric-contract-api';

@Object()
export class SseAsset {

    @Property()
    public id: string;

    @Property()
    public value: string;

}

export interface Index {
    hash: string;
    pointers: string[];
}
