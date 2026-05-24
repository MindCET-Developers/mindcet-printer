const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const printer = require('pdf-to-printer');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const app = express();
const PORT = 5001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static frontend (index.html, style.css, app.js)

// File Databases
const CONFIG_FILE = path.join(__dirname, 'config.json');
const JOBS_FILE = path.join(__dirname, 'jobs.json');
const TEMP_DIR = path.join(__dirname, 'temp_print');

// Global Automation State
let pollingIntervalId = null;
let isPollingActive = false;
let currentConfig = {};
let printJobsHistory = [];
let stats = { printed: 0, skipped: 0, failed: 0 };
let currentPollingStatus = false; // Is automation actively ticking?

// Ensure folders and database files exist on startup
function initStorage() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } else {
        // Clear old temp files on boot
        try {
            fs.readdirSync(TEMP_DIR).forEach(file => {
                fs.unlinkSync(path.join(TEMP_DIR, file));
            });
        } catch (e) {
            console.error('Failed to clear temp directory:', e.message);
        }
    }

    // Default configuration
    const defaultConfig = {
        provider: 'gmail',
        host: 'imap.gmail.com',
        port: 993,
        user: '',
        pass: '',
        folder: 'INBOX',
        filterTag: '[PRINT]',
        printer: 'default',
        interval: 60000,
        deleteAfterPrint: true
    };

    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
        currentConfig = defaultConfig;
    } else {
        try {
            currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (err) {
            console.error('Corrupted config.json. Overwriting with defaults.');
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
            currentConfig = defaultConfig;
        }
    }

    if (!fs.existsSync(JOBS_FILE)) {
        fs.writeFileSync(JOBS_FILE, JSON.stringify([], null, 2), 'utf8');
        printJobsHistory = [];
    } else {
        try {
            printJobsHistory = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
            
            // Recalculate stats from loaded logs
            stats = { printed: 0, skipped: 0, failed: 0 };
            printJobsHistory.forEach(job => {
                if (job.status === 'SUCCESS') stats.printed++;
                else if (job.status === 'SKIPPED') stats.skipped++;
                else if (job.status === 'FAILED') stats.failed++;
            });
        } catch (err) {
            console.error('Corrupted jobs.json. Resetting logs.');
            fs.writeFileSync(JOBS_FILE, JSON.stringify([], null, 2), 'utf8');
            printJobsHistory = [];
        }
    }
}

initStorage();

// Save Jobs Logs helper
function logPrintJob(job) {
    printJobsHistory.push(job);
    // Maintain max 500 history entries
    if (printJobsHistory.length > 500) {
        printJobsHistory.shift();
    }
    
    // Update stats counters
    if (job.status === 'SUCCESS') stats.printed++;
    else if (job.status === 'SKIPPED') stats.skipped++;
    else if (job.status === 'FAILED') stats.failed++;

    try {
        fs.writeFileSync(JOBS_FILE, JSON.stringify(printJobsHistory, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to write jobs.json:', e.message);
    }
}

/* ==========================================================================
   IMAGE TO PDF CONVERSION UTILITY
   ========================================================================== */
async function convertImageToPdf(imagePath, outPdfPath) {
    const pdfDoc = await PDFDocument.create();
    const imageBytes = fs.readFileSync(imagePath);
    
    let embeddedImage;
    if (imagePath.toLowerCase().endsWith('.png')) {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
    } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
    }
    
    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: embeddedImage.width,
        height: embeddedImage.height
    });
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPdfPath, pdfBytes);
}

/* ==========================================================================
   BACKGROUND EMAIL POLLING WORKER
   ========================================================================== */
let isCheckingEmails = false; // Lock to prevent overlapping checks

async function checkEmails() {
    if (isCheckingEmails) {
        console.log('[AutoPrint Engine] Poll skipped. Previous poll is still in progress.');
        return;
    }

    if (!currentConfig.user || !currentConfig.pass) {
        console.log('[AutoPrint Engine] Poll skipped. Credentials not configured.');
        return;
    }

    isCheckingEmails = true;
    console.log('[AutoPrint Engine] Starting email scan cycle...');

    const client = new ImapFlow({
        host: currentConfig.host,
        port: currentConfig.port,
        secure: true,
        auth: {
            user: currentConfig.user,
            pass: currentConfig.pass
        },
        logger: false
    });

    try {
        await client.connect();
        
        // Select folder (usually INBOX) and lock it
        const folderPath = currentConfig.folder || 'INBOX';
        let lock = await client.getMailboxLock(folderPath);
        
        try {
            // Search for unread emails (unseen)
            const uids = await client.search({ seen: false }, { uid: true });
            console.log(`[AutoPrint Engine] Found ${uids.length} unread emails in folder: ${folderPath}`);

            for (const uid of uids) {
                // Fetch email source
                const messageObj = await client.fetchOne(uid, { source: true }, { uid: true });
                if (!messageObj || !messageObj.source) continue;

                // Parse with mailparser
                const parsedEmail = await simpleParser(messageObj.source);
                const subject = parsedEmail.subject || '(ללא נושא)';
                const senderAddress = parsedEmail.from ? parsedEmail.from.value[0].address : 'unknown@sender.com';
                const senderName = parsedEmail.from ? (parsedEmail.from.value[0].name || senderAddress) : 'שולח לא ידוע';
                
                console.log(`[AutoPrint Engine] Processing email UID: ${uid} | Sender: ${senderAddress} | Subject: "${subject}"`);

                // Check subject filter keyword
                const filterTag = currentConfig.filterTag || '';
                const hasTag = filterTag === '' || subject.toLowerCase().includes(filterTag.toLowerCase());

                if (!hasTag) {
                    console.log(`[AutoPrint Engine] Skipped email UID ${uid}. Subject does not contain keyword: "${filterTag}"`);
                    
                    // Mark as read so we don't scan it again
                    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                    
                    logPrintJob({
                        id: `job-${Date.now()}-${uid}`,
                        timestamp: new Date().toISOString(),
                        sender: senderAddress,
                        senderName: senderName,
                        subject: subject,
                        attachments: [],
                        status: 'SKIPPED'
                    });
                    continue;
                }

                // If it matches, extract printable attachments
                const rawAttachments = parsedEmail.attachments || [];
                const printableAttachments = rawAttachments.filter(att => {
                    const ext = path.extname(att.filename || '').toLowerCase();
                    return ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg';
                });

                if (printableAttachments.length === 0) {
                    console.log(`[AutoPrint Engine] Email UID ${uid} matched filter but has no printable attachments.`);
                    
                    // Mark as read
                    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                    
                    logPrintJob({
                        id: `job-${Date.now()}-${uid}`,
                        timestamp: new Date().toISOString(),
                        sender: senderAddress,
                        senderName: senderName,
                        subject: subject,
                        attachments: [],
                        status: 'SKIPPED'
                    });
                    continue;
                }

                // Print attachments
                console.log(`[AutoPrint Engine] Printing ${printableAttachments.length} attachments from email: "${subject}"`);
                let allJobsSuccessful = true;
                const printedFilesList = [];

                for (const att of printableAttachments) {
                    const tempFileName = `${Date.now()}_${att.filename}`;
                    const tempFilePath = path.join(TEMP_DIR, tempFileName);
                    
                    // Save buffer to temporary file
                    fs.writeFileSync(tempFilePath, att.content);
                    printedFilesList.push({ name: att.filename, size: att.size });

                    try {
                        const printOptions = currentConfig.printer === 'default' 
                            ? {} 
                            : { printer: currentConfig.printer };

                        const ext = path.extname(att.filename || '').toLowerCase();
                        
                        if (ext === '.pdf') {
                            // Print PDF directly
                            await printer.print(tempFilePath, printOptions);
                            console.log(`[AutoPrint Engine] Silent print queued for PDF: ${att.filename}`);
                        } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
                            // Convert image to PDF first
                            const convertedPdfPath = `${tempFilePath}.pdf`;
                            await convertImageToPdf(tempFilePath, convertedPdfPath);
                            
                            // Print converted PDF
                            await printer.print(convertedPdfPath, printOptions);
                            console.log(`[AutoPrint Engine] Image converted & print queued for: ${att.filename}`);
                            
                            // Clean up converted PDF
                            try { fs.unlinkSync(convertedPdfPath); } catch (_) {}
                        }
                    } catch (printErr) {
                        console.error(`[AutoPrint Engine] Failed to print attachment "${att.filename}":`, printErr.message);
                        allJobsSuccessful = false;
                    } finally {
                        // Clean up temporary image/pdf file
                        try { fs.unlinkSync(tempFilePath); } catch (_) {}
                    }
                }

                // Process post-print actions
                if (allJobsSuccessful) {
                    logPrintJob({
                        id: `job-${Date.now()}-${uid}`,
                        timestamp: new Date().toISOString(),
                        sender: senderAddress,
                        senderName: senderName,
                        subject: subject,
                        attachments: printedFilesList,
                        status: 'SUCCESS'
                    });

                    // Archive / Delete or Mark Read
                    if (currentConfig.deleteAfterPrint) {
                        console.log(`[AutoPrint Engine] Moving email UID ${uid} to Trash...`);
                        
                        // Dynamically look for the Trash folder
                        const mailboxes = await client.list();
                        const trashBox = mailboxes.find(m => m.specialUse === '\\Trash');
                        
                        if (trashBox) {
                            await client.messageMove(uid, trashBox.path, { uid: true });
                            console.log(`[AutoPrint Engine] Moved to Trash folder: ${trashBox.path}`);
                        } else {
                            console.log('[AutoPrint Engine] Trash folder not found. Marking as deleted...');
                            await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
                        }
                    } else {
                        // Mark as read
                        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                    }
                } else {
                    logPrintJob({
                        id: `job-${Date.now()}-${uid}`,
                        timestamp: new Date().toISOString(),
                        sender: senderAddress,
                        senderName: senderName,
                        subject: subject,
                        attachments: printedFilesList,
                        status: 'FAILED'
                    });
                    
                    // Even if print failed, mark email as read so we don't try to print it again in an infinite loop
                    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                }
            }
        } finally {
            // Always release lock
            lock.release();
        }
        
        await client.logout();
    } catch (err) {
        console.error('[AutoPrint Engine] Error scanning emails:', err.message);
    } finally {
        isCheckingEmails = false;
        console.log('[AutoPrint Engine] Email scan cycle completed.');
    }
}

// Control background timers
function startAutoPolling() {
    stopAutoPolling();
    const interval = currentConfig.interval || 60000;
    console.log(`[AutoPrint Service] Starting auto-polling worker. Check interval: ${interval / 1000}s`);
    
    // Initial run
    checkEmails();
    
    pollingIntervalId = setInterval(checkEmails, interval);
    currentPollingStatus = true;
}

function stopAutoPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
    currentPollingStatus = false;
    console.log('[AutoPrint Service] Background auto-polling worker stopped.');
}

/* ==========================================================================
   REST API ENDPOINTS
   ========================================================================== */

// 1. GET Service Status
app.get('/api/status', (req, res) => {
    res.json({
        isRunning: currentPollingStatus,
        config: currentConfig,
        stats: stats
    });
});

// 2. POST Save Configuration
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        currentConfig = { ...currentConfig, ...newConfig };
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
        console.log('[API] New configuration saved successfully.');
        
        // If the service is running, restart it to apply new settings (interval, credentials)
        if (currentPollingStatus) {
            console.log('[API] Restarting background worker to apply new configurations.');
            startAutoPolling();
        }
        
        res.json({ success: true, config: currentConfig });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. GET System Printers
app.get('/api/printers', async (req, res) => {
    try {
        const printersList = await printer.getPrinters();
        res.json(printersList);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. POST Test Email Credentials (without saving)
app.post('/api/test-email', async (req, res) => {
    const testCreds = req.body;
    
    const client = new ImapFlow({
        host: testCreds.host,
        port: testCreds.port || 993,
        secure: true,
        auth: {
            user: testCreds.user,
            pass: testCreds.pass
        },
        logger: false
    });

    try {
        await client.connect();
        await client.logout();
        res.json({ success: true, message: 'Connection successful!' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// 5. POST Print Test Page
app.post('/api/test-print', async (req, res) => {
    const { printer: selectedPrinter } = req.body;
    const testFileName = `autoprint_test_${Date.now()}.pdf`;
    const testFilePath = path.join(TEMP_DIR, testFileName);

    try {
        // Generate a beautiful PDF dynamically
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const page = pdfDoc.addPage([500, 300]);
        
        page.drawText('AutoPrint Test Page', {
            x: 50,
            y: 220,
            size: 26,
            font: font,
            color: rgb(0.23, 0.51, 0.96), // Clean blue
        });

        page.drawText('Your automatic email printing service is working correctly!', {
            x: 50,
            y: 160,
            size: 13,
            color: rgb(0.1, 0.1, 0.1),
        });

        const printTime = new Date().toLocaleString('he-IL');
        page.drawText(`Print Date/Time: ${printTime}`, {
            x: 50,
            y: 120,
            size: 11,
            color: rgb(0.4, 0.4, 0.4),
        });

        page.drawText(`Target Printer: ${selectedPrinter === 'default' ? 'Default Windows Printer' : selectedPrinter}`, {
            x: 50,
            y: 100,
            size: 11,
            color: rgb(0.4, 0.4, 0.4),
        });

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(testFilePath, pdfBytes);

        // Print silently
        const printOptions = selectedPrinter === 'default' ? {} : { printer: selectedPrinter };
        await printer.print(testFilePath, printOptions);

        // Delete test pdf after sending to spooler
        setTimeout(() => {
            try { fs.unlinkSync(testFilePath); } catch (_) {}
        }, 10000);

        res.json({ success: true, message: 'Test page printed!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. GET Print Jobs History
app.get('/api/jobs', (req, res) => {
    res.json(printJobsHistory);
});

// 7. DELETE Clear History
app.delete('/api/jobs', (req, res) => {
    try {
        printJobsHistory = [];
        stats = { printed: 0, skipped: 0, failed: 0 };
        fs.writeFileSync(JOBS_FILE, JSON.stringify([], null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. POST Control automation service (start / stop / sync)
app.post('/api/control', async (req, res) => {
    const { action } = req.body;
    
    if (action === 'start') {
        startAutoPolling();
        res.json({ success: true, isRunning: true });
    } else if (action === 'stop') {
        stopAutoPolling();
        res.json({ success: true, isRunning: false });
    } else if (action === 'sync') {
        // Trigger manual check asynchronously
        checkEmails();
        res.json({ success: true, message: 'Email check initiated.' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid action.' });
    }
});

// Start the Express Server
app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`  AutoPrint Server is running on: http://localhost:${PORT}`);
    console.log(`  Static Web UI dashboard: Open your browser on http://localhost:${PORT}`);
    console.log(`================================================================`);
});
