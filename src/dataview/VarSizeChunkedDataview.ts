import TreeMap from "ts-treemap";
import {CFDataview} from "./СFDataview";
import {SimpleDataview} from "./SimpleDataview";

/**
 * @internal
 */
export class VariableSizeChunkedDataView implements CFDataview {

    private readonly viewMap: TreeMap<number, CFDataview> = new TreeMap();
    private readonly size: number;

    constructor(views: CFDataview[]) {
        let size = 0;
        for (const view of views) {
            size += view.getSize();
            this.viewMap.set(size - 1, view);
        }
        this.size = size;
    }

    writeAt(position: number, bytes: Uint8Array): CFDataview {
        if(position < 0) throw new Error("Cannot write at index < 0: start = " + position);
        if(position + bytes.length > this.size) throw new Error(`Sub-view should has end index < ${this.size}: end = ${position + bytes.length - 1}`);
        let startingPositionInFirstView: number;
        const beforeFirst = this.viewMap.lowerKey(position);
        if(beforeFirst == null) {
            startingPositionInFirstView = position;
        } else {
            startingPositionInFirstView = position - beforeFirst - 1;
        }
        let remaining = bytes.length;
        let currentEntry = this.viewMap.ceilingEntry(position);
        const currentKey: number = currentEntry[0];
        const currentView: CFDataview = currentEntry[1];
        let bytesToWrite = Math.min(currentView.subView(startingPositionInFirstView).getSize(), remaining);
        remaining -= bytesToWrite;
            currentView.writeAt(startingPositionInFirstView, bytes.subarray(0, bytesToWrite));
        while(remaining > 0) {
            currentEntry = this.viewMap.higherEntry(currentKey)
            if(currentEntry == null) {
                throw new Error("Preliminary end of chain");
            } else {
                bytesToWrite = Math.min(currentView.getSize(), remaining);
                remaining -= bytesToWrite;
                currentView.writeAt(0, bytes.subarray(0, bytesToWrite));
            }
        }
        return this;
    }

    getSize(): number {
        return this.size;
    }

    getData(): Uint8Array {
        const result = new Uint8Array(this.getSize());
        let index = 0;
        for (const view of Array.from(this.viewMap.values())) {
            result.set(view.getData(), index);
            index += view.getSize();
        }
        return result;
    }

    subView(start: number, end?: number): CFDataview {
        if(end == null) {
            end = this.getSize();
        }
        if(start < 0) throw new Error("Sub-view should has starting index >= 0: start = " + start);
        if(end > this.size) throw new Error(`Sub-view should has end index < ${this.getSize()}: end = ${end}`);
        if(start >= this.getSize()) throw new Error(`Sub-view should not exceed the size of a view: size = ${this.getSize()}`);
        if(start > end) throw new Error(`Sub-view start should be less or equal to end: start(${start}) / end(${end})`);
        if(start === end) {
            return new SimpleDataview(new Uint8Array(0));
        }
        const last = end - 1;
        const firstEntry = this.viewMap.ceilingEntry(start);
        const firstEntryValue = firstEntry[1];
        const firstEntryKey = firstEntry[0];
        const lastEntry = this.viewMap.ceilingEntry(last);
        const lastEntryValue = lastEntry[1];
        const lastEntryKey = firstEntry[0];
        let startingPositionInFirstView;
        const beforeFirst = this.viewMap.lowerKey(start);
        if(beforeFirst == null) {
            startingPositionInFirstView = start;
        } else {
            startingPositionInFirstView = start - beforeFirst - 1;
        }
        if(firstEntry === lastEntry) {
            if(beforeFirst === null) {
                return firstEntryValue.subView(startingPositionInFirstView, end);
            } else {
                return firstEntryValue.subView(startingPositionInFirstView, end - beforeFirst - 1);
            }
        } else {
            const beforeLast = this.viewMap.lowerKey(last);
            const result: CFDataview[] = [];
            result.push(firstEntryValue.subView(startingPositionInFirstView));
            result.push(...Array.from(this.viewMap.splitHigher(firstEntryKey, false).splitLower(lastEntryKey, false).values()));
            result.push(lastEntryValue.subView(0, end - beforeLast - 1));
            return new VariableSizeChunkedDataView(result);
        }
    }
    allocate(length: number): CFDataview {
        throw new Error("Unsupported Operation");
    }

    fill(filler: Uint8Array): CFDataview {
        this.viewMap.forEach((view, key) => view.fill(filler));
        return this;
    }

    readAt(position: number, length: number): Uint8Array {
        return this.subView(position, position + length).getData();
    }

    isEmpty(): boolean {
        return this.getSize() === 0;
    }
}