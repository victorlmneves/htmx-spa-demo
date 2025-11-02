import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, "public");

// Helper function to check if request is from HTMX
function isHtmxRequest(req) {
    const hxRequest =
        req.headers["hx-request"] || req.get("hx-request") || req.get("HX-Request");

    return (
        hxRequest === "true" ||
        hxRequest === true ||
        String(hxRequest).toLowerCase() === "true"
    );
}

// Helper function to safely resolve paths within public directory
// Prevents directory traversal attacks
function safeResolvePublicPath(requestedPath) {
    const resolvedPath = path.resolve(publicDir, requestedPath);
    const relativePath = path.relative(publicDir, resolvedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return null; // Path traversal attempt detected
    }

    return resolvedPath;
}

// Helper function to extract content fragment from HTML
function extractContentFragment(htmlContent) {
    const contentMatch = htmlContent.match(
        /<main id="content">([\s\S]*?)<\/main>/
    );

    if (contentMatch) {
        return contentMatch[1].trim();
    }

    return htmlContent;
}

// Helper function to wrap fragment content in full HTML structure
function wrapInFullHtml(fragmentContent) {
    const indexPath = path.join(publicDir, "index.html");
    const indexHtml = fs.readFileSync(indexPath, "utf8");

    // Replace the content inside <main id="content"> with the fragment
    return indexHtml.replace(
        /<main id="content">([\s\S]*?)<\/main>/,
        `<main id="content">${fragmentContent}</main>`
    );
}

// Define routes BEFORE static middleware to ensure they take precedence
// Serve main pages
app.get("/", (req, res) => {
    if (isHtmxRequest(req)) {
        // HTMX request - return only the content fragment
        const htmlPath = path.join(publicDir, "index.html");
        const htmlContent = fs.readFileSync(htmlPath, "utf8");
        const fragment = extractContentFragment(htmlContent);

        res.send(fragment);
    } else {
        // Regular request - return full page
        res.sendFile(path.join(publicDir, "index.html"));
    }
});

app.get("/:page", (req, res, next) => {
    const page = req.params.page;

    // Skip static assets (CSS, JS, images, etc.) - let static middleware handle them
    const staticExtensions = [
        ".css",
        ".js",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".svg",
        ".ico",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".json",
    ];

    const ext = path.extname(page).toLowerCase();

    if (staticExtensions.includes(ext)) {
        // Pass to next middleware (static middleware)
        return next();
    }

    // Safely resolve path and prevent directory traversal
    const filePath = safeResolvePublicPath(page);

    // If path traversal detected or path resolution failed, return 404
    if (!filePath || !fs.existsSync(filePath)) {
        if (isHtmxRequest(req)) {
            const htmlPath = path.join(publicDir, "404.html");
            const htmlContent = fs.readFileSync(htmlPath, "utf8");

            res.send(htmlContent);
        } else {
            res.sendFile(path.join(publicDir, "404.html"));
        }

        return;
    }

    // If it's an HTMX request and the file is index.html, extract fragment
    if (isHtmxRequest(req) && page === "index.html") {
        const htmlContent = fs.readFileSync(filePath, "utf8");
        const fragment = extractContentFragment(htmlContent);

        res.send(fragment);
    } else if (isHtmxRequest(req)) {
        // HTMX request for other pages - they already contain fragments
        const htmlContent = fs.readFileSync(filePath, "utf8");

        res.send(htmlContent);
    } else {
        // SSR request - for non-index pages, wrap fragment in full HTML structure
        if (page !== "index.html") {
            const fragmentContent = fs.readFileSync(filePath, "utf8");
            const fullHtml = wrapInFullHtml(fragmentContent);

            res.send(fullHtml);
        } else {
            // Regular request for index.html - serve full page
            res.sendFile(filePath);
        }
    }
});

// Static middleware AFTER routes so routes take precedence
app.use(express.static(publicDir));

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
