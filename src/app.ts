import express from "express";
import RSS from "rss";
import Parser from "rss-parser";
import { ItemOptions } from './types/item-options';
import cheerio from 'cheerio';
import request from 'request-promise';

const app = express();

// Express configuration
app.set("port", process.env.PORT || 3000);

// Routes
app.get('/', async (req, res) => {
    const { feed, selectors } = req.query;

    if (!feed) {
        return res.status(400).send('Error: Missing `feed` query param.')
    }

    if (!selectors) {
        return res.status(400).send('Error: Missing `selectors` query param.')
    }

    const htmlSelectors = JSON.parse(selectors)
    let originalFeed;
    try {
        originalFeed = await new Parser({
            customFields: {
                feed: ["image", "managingEditor", "copyright", "language"]
            }
        }).parseURL(feed);
    } catch (err) {
        return res.status(400).send('Error: Cannot parse feed.');
    }

    const newFeed = new RSS(transformFeed(originalFeed))
    const transformedItems = await transformItems(originalFeed.items, htmlSelectors);
    transformedItems.forEach((item) => {
        newFeed.item(item);
    })

    res.set('Content-Type', 'text/xml');
    res.send(newFeed.xml())
})

function transformFeed(originalFeed: Parser.Output) {
    return {
        title: originalFeed.title,
        description: originalFeed.description,
        feed_url: originalFeed.feedUrl,
        site_url: originalFeed.link,
        image_url: originalFeed.image.url,
        managingEditor: originalFeed.managingEditor,
        copyright: originalFeed.copyright,
        language: originalFeed.language
    }
}

async function transformItems(input: Parser.Output["items"], selectors: string[]): Promise<ItemOptions[]> {
    return await Promise.all(input.map(async (inputItem) => await transformItem(inputItem, selectors)));
}

async function transformItem(inputItem: Parser.Item, selectors: string[]): Promise<ItemOptions> {
    // TODO get cached from redis
    return {
        title: inputItem.title,
        description: await parseContent(inputItem.link, selectors),
        url: inputItem.link,
        guid: inputItem.guid,
        categories: inputItem.categories,
        author: inputItem.creator,
        date: inputItem.pubDate
    }
}

async function parseContent(url: string, selectors: string[]): Promise<string> {
    const html = await request(url);
    const $ = cheerio.load(html);
    let output = '';

    for(let selector of selectors) {
        output += $(selector);
    }

    return output;
}

export default app;
