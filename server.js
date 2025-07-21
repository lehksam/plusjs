import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = false;


function processClasses(htmlString, cssString, callback) {
    // Extract all classes from HTML
    const htmlClassRegex = /class=["'](.*?)["']/g;
    const htmlClasses = new Set();
    
    let match;
    while ((match = htmlClassRegex.exec(htmlString)) !== null) {
      // Split multiple classes in a single class attribute
      const classes = match[1].split(/\s+/);
      classes.forEach(cls => {
        if (cls) htmlClasses.add(cls);
      });
    }
  
    // Process CSS string
    const cssClassRegex = /\.([\w-]+)(?=[^{}]*\{)/g;
    let processedCss = cssString;
    let cssMatch;
    
    // Keep track of processed classes to handle multiple occurrences
    const processedClasses = new Map();
  
    while ((cssMatch = cssClassRegex.exec(cssString)) !== null) {
      const cssClass = cssMatch[1];
      
      // Check if this class exists in HTML and hasn't been processed yet
      if (htmlClasses.has(cssClass) && !processedClasses.has(cssClass)) {
        const newClass = callback(cssClass);
        if (newClass && typeof newClass === 'string') {
          // Create regex to replace all occurrences of this class in CSS
          const replaceRegex = new RegExp(`\\.${cssClass}(?=[^{}]*\\{)`, 'g');
          processedCss = processedCss.replace(replaceRegex, `.${newClass}`);
          
          // Replace class in HTML
          const htmlReplaceRegex = new RegExp(`(class=["'].*?)\\b${cssClass}\\b(.*?["'])`, 'g');
          htmlString = htmlString.replace(htmlReplaceRegex, `$1${newClass}$2`);
          
          // Mark this class as processed
          processedClasses.set(cssClass, newClass);
        }
      }
    }
  
    return {
      html: htmlString,
      css: processedCss,
      processedClasses: Object.fromEntries(processedClasses)
    };
  } 

async function createServer() {
  const app = express();

  let vite;
  if (!isProduction) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist/client')));
  }

  app.use(async (req, res) => {
    if (req.path === '/styles.css') {
        res.type('text/css');
        const requested = req.query.c
        if (requested === 'app')
        {
            let render = (await vite.ssrLoadModule('/src/ssr.js')).render;
            const { html: toProcessHtml, css: toProcessCss} = await render()
            const { css } = processClasses(toProcessHtml, toProcessCss, (name) => name + 's')
            res.status(200).end(css)
        }
        res.status(200).end()
        return
      }
    const url = req.originalUrl;

    try {
      let template;
      let render;

      if (!isProduction) {
        template = await fs.readFile(
          path.resolve(__dirname, 'index.html'),
          'utf-8'
        );
        template = await vite.transformIndexHtml(url, template);
        render = (await vite.ssrLoadModule('/src/ssr.js')).render;
      } else {
        template = await fs.readFile(
          path.resolve(__dirname, 'dist/client/index.html'),
          'utf-8'
        );
        render = (await import('./dist/server/entry-server.js')).render;
      }

      // Get the rendered content from your custom renderer
      const { html: toProcessHtml, css: toProcessCss} = await render()
      const { html} = processClasses(toProcessHtml, toProcessCss, (name) => name + 's')

      // Replace placeholder with rendered content
      const templateHtml = template
        .replace('<!--ssr-outlet-->', html)
        .replace('<!--ssr-styles-->', `<link rel="stylesheet" href="/styles.css?c=app">`)

      res.status(200).set({ 'Content-Type': 'text/html' }).end(templateHtml);
    } catch (e) {
      if (!isProduction) {
        vite.ssrFixStacktrace(e);
      }
      console.error(e);
      res.status(500).end(e.message);
    }
  });

//   app.get('/styles.css', async (req, res) => {
 
//   })

  return { app, vite };
}

createServer().then(({ app }) => {
  app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
  });
});