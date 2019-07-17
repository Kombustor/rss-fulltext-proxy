export interface ItemOptions {
    title: string;
    description: string;
    url: string;
    guid?: string;
    categories?: string[];
    author?: string;
    date: Date | string;
}