export type Ntc = Readonly<{
    id: string;
    ttl: string;
    txt: string;
    st: string;
    en: string;
    stDt: Date;
    enDt: Date;
}>;

export type Seen = readonly string[];
export type OnToggle = (() => void) | undefined;
