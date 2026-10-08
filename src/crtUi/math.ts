import {
    BASE_FREQ_NOTCH_HZ,
    GAIN_NOTCH
} from "./constants.ts";

export function formatNumber(
    value: number,
    decimals: number = 2
): string {
    return value.toFixed(decimals);
}

function snapTo(
    value: number,
    presets: readonly number[],
    threshold: number
): number {
    let nearest = value;
    let distance = Number.POSITIVE_INFINITY;

    for (const preset of presets) {
        const nextDistance = Math.abs(value - preset);
        if (nextDistance >= distance) continue;
        distance = nextDistance;
        nearest = preset;
    }

    return distance <= threshold ? nearest : value;
}

export function snapBase(value: number): number {
    return Number(
        snapTo(value, [50, 60], BASE_FREQ_NOTCH_HZ)
            .toFixed(2)
    );
}

export function snapGain(value: number): number {
    return Number(
        snapTo(value, [1], GAIN_NOTCH)
            .toFixed(2)
    );
}
