import cheerio from 'cheerio';
import express from "express";
import request from 'request-promise';
import RSS from "rss";
import Parser from "rss-parser";
import redis from "redis";
import { ItemOptions } from './types/item-options';
const {promisify} = require('util');

// Config with defaults
const config = {
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1',
    CACHE_EXPIRY_SECONDS: process.env.CACHE_EXPIRY_SECONDS || 60 * 15
}


const app = express();
const redisClient = redis.createClient(config.REDIS_URL)
const redisGetAsync = promisify(redisClient.get).bind(redisClient);
const redisSetAsync = promisify(redisClient.set).bind(redisClient);

// Express configuration
app.set("port", process.env.PORT || 3000);

// Routes
app.get('/', async (req, res) => {
    const { feed, selectors } = req.query;

    // Check if params are set
    if (!feed) {
        return res.status(400).send('Error: Missing `feed` query param.')
    }
    if (!selectors) {
        return res.status(400).send('Error: Missing `selectors` query param.')
    }

    try {
        // Parse html selectors from query-params
        const htmlSelectors = JSON.parse(selectors)

        // Get the original feed
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

        // Create the new feed from the original one
        const newFeed = new RSS(transformFeed(originalFeed))

        // Transform and add all items to the feed
        const transformedItems = await transformItems(originalFeed.items, htmlSelectors);
        transformedItems.forEach((item) => {
            newFeed.item(item);
        })

        // Send the feed as response
        res.set('Content-Type', 'text/xml');
        res.send(newFeed.xml())
    } catch (err) {
        return res.status(500).send('Error: Internal Server Error: ' + err)
    }
})

function transformFeed(originalFeed: Parser.Output) {
    return {
        title: originalFeed.title,
        description: originalFeed.description,
        feed_url: originalFeed.feedUrl,
        site_url: originalFeed.link,
        image_url: originalFeed.image ? originalFeed.image.url : undefined,
        managingEditor: originalFeed.managingEditor,
        copyright: originalFeed.copyright,
        language: originalFeed.language
    }
}

async function transformItems(input: Parser.Output["items"], selectors: string[]): Promise<ItemOptions[]> {
    return await Promise.all(input.map(async (inputItem) => await transformItem(inputItem, selectors)));
}

async function transformItem(inputItem: Parser.Item, selectors: string[]): Promise<ItemOptions> {
    // Selecting identifier
    const identifier = inputItem.guid || inputItem.link || inputItem.title;

    // Return cached element if available
    const cached = await redisGetAsync(identifier);
    if(cached) {
        return JSON.parse(cached);
    }

    const result = {
        title: inputItem.title,
        description: await parseContent(inputItem.link, selectors),
        url: inputItem.link,
        guid: inputItem.guid,
        categories: inputItem.categories,
        author: inputItem.creator,
        date: inputItem.pubDate
    }

    // Cache result
    await redisSetAsync(identifier, JSON.stringify(result), 'EX', config.CACHE_EXPIRY_SECONDS);

    return result;
}

async function parseContent(url: string, selectors: string[]): Promise<string> {
    // Load HTML
    const html = await request(url);

    // Pass HTML into cheerio
    const $ = cheerio.load(html);

    // Gather output html
    let output = '';
    for (let selector of selectors) {
        output += $(selector);
    }

    return output;
}

export default app;
