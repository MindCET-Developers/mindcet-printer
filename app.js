/* ==========================================================================
   AUTOPRINT FRONTEND CONTROLLER (app.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();

    // App State
    let isServiceRunning = false;
    let autoCheckTimer = null;
    let isDemoMode = true; // Will dynamically switch to false if API responds
    let printHistory = [];
    let stats = { printed: 0, skipped: 0, failed: 0 };
    let apiBaseUrl = ''; // Relative path since they are hosted together

    // DOM Elements
    const emailProvider = document.getElementById('email-provider');
    const imapServerGroup = document.getElementById('imap-server-group');
    const imapHost = document.getElementById('imap-host');
    const imapPort = document.getElementById('imap-port');
    const emailAddress = document.getElementById('email-address');
    const appPassword = document.getElementById('app-password');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const passwordEyeIcon = document.getElementById('password-eye-icon');
    const passwordHelpTrigger = document.getElementById('password-help-trigger');
    const imapFolder = document.getElementById('imap-folder');
    const filterTag = document.getElementById('filter-tag');
    
    const printerSelect = document.getElementById('printer-select');
    const refreshPrintersBtn = document.getElementById('refresh-printers-btn');
    const printerRefreshIcon = document.getElementById('printer-refresh-icon');
    
    const checkInterval = document.getElementById('check-interval');
    const deleteAfterPrint = document.getElementById('delete-after-print');
    
    const settingsForm = document.getElementById('settings-form');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const testConnectionBtn = document.getElementById('test-connection-btn');
    const testPrintBtn = document.getElementById('test-print-btn');
    
    const startServiceBtn = document.getElementById('start-service-btn');
    const stopServiceBtn = document.getElementById('stop-service-btn');
    const syncNowBtn = document.getElementById('sync-now-btn');
    const globalStatusIndicator = document.getElementById('global-status-indicator');
    const globalStatusText = document.getElementById('global-status-text');
    const servicePulse = document.getElementById('service-pulse');
    
    const statPrinted = document.getElementById('stat-printed');
    const statSkipped = document.getElementById('stat-skipped');
    const statFailed = document.getElementById('stat-failed');
    
    const logsTbody = document.getElementById('logs-tbody');
    const emptyLogsRow = document.getElementById('empty-logs-row');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    
    // Help Modal Elements
    const helpModal = document.getElementById('help-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalOkBtn = document.getElementById('modal-ok-btn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    /* ==========================================================================
       NOTIFICATION UTILITY (Toast)
       ========================================================================== */
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconName = 'check-circle';
        if (type === 'error') iconName = 'alert-octagon';
        if (type === 'warning') iconName = 'alert-triangle';
        
        toast.innerHTML = `
            <i data-lucide="${iconName}" class="toast-icon"></i>
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        lucide.createIcons({ attrs: { class: 'toast-icon' } });
        
        // Auto-remove toast after 4 seconds
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    /* ==========================================================================
       MODAL CONTROLLERS
       ========================================================================== */
    passwordHelpTrigger.addEventListener('click', () => {
        helpModal.classList.add('open');
    });

    const closeModal = () => {
        helpModal.classList.remove('open');
    };
    modalCloseBtn.addEventListener('click', closeModal);
    modalOkBtn.addEventListener('click', closeModal);
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) closeModal();
    });

    // Tab switcher in Modal
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    /* ==========================================================================
       FORM INTERACTIONS
       ========================================================================== */
    // Password toggle visibility
    togglePasswordBtn.addEventListener('click', () => {
        const type = appPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        appPassword.setAttribute('type', type);
        
        if (type === 'password') {
            passwordEyeIcon.setAttribute('data-lucide', 'eye');
        } else {
            passwordEyeIcon.setAttribute('data-lucide', 'eye-off');
        }
        lucide.createIcons();
    });

    // Provider Selector logic
    emailProvider.addEventListener('change', () => {
        const val = emailProvider.value;
        if (val === 'custom') {
            imapServerGroup.style.display = 'block';
            imapHost.setAttribute('required', 'true');
        } else {
            imapServerGroup.style.display = 'none';
            imapHost.removeAttribute('required');
            
            if (val === 'gmail') {
                imapHost.value = 'imap.gmail.com';
                imapPort.value = '993';
            } else if (val === 'outlook') {
                imapHost.value = 'outlook.office365.com';
                imapPort.value = '993';
            }
        }
    });

    /* ==========================================================================
       API INTEGRATION
       ========================================================================== */
    // Check if Express backend is running and pull configuration
    async function checkApiConnection() {
        try {
            const res = await fetch(`${apiBaseUrl}/api/status`);
            if (res.ok) {
                const data = await res.json();
                isDemoMode = false;
                console.log('Connected to Backend API! Disabling demo simulation.');
                loadConfigFromServer(data.config);
                updateStats(data.stats || stats);
                loadPrintersList();
                loadJobsHistory();
                updateServiceStatusUI(data.isRunning);
            } else {
                setupDemoMode();
            }
        } catch (err) {
            console.log('Backend API offline. Running in Demo / Simulation Mode.');
            setupDemoMode();
        }
    }

    function setupDemoMode() {
        isDemoMode = true;
        showToast('פועל במצב סימולציה (מצב דמו) - שרת מקומי לא מחובר', 'warning');
        // Add fake printers
        populatePrintersDropdown([
            { name: 'HP OfficeJet Pro 8710 (מקומי)', deviceId: 'hp-8710' },
            { name: 'Brother MFC-L2710DW (רשת)', deviceId: 'brother-l2710' },
            { name: 'Canon LBP6030 (USB)', deviceId: 'canon-6030' },
            { name: 'Microsoft Print to PDF', deviceId: 'ms-pdf' }
        ]);
    }

    function loadConfigFromServer(config) {
        if (!config) return;
        emailProvider.value = config.provider || 'gmail';
        emailProvider.dispatchEvent(new Event('change'));
        
        emailAddress.value = config.user || '';
        appPassword.value = config.pass || '';
        imapFolder.value = config.folder || 'INBOX';
        filterTag.value = config.filterTag || '[PRINT]';
        checkInterval.value = config.interval || '60000';
        deleteAfterPrint.checked = !!config.deleteAfterPrint;
        
        if (config.provider === 'custom') {
            imapHost.value = config.host || '';
            imapPort.value = config.port || '993';
        }
        
        if (config.printer) {
            // Select printer
            setTimeout(() => {
                printerSelect.value = config.printer;
            }, 500);
        }
    }

    async function loadPrintersList() {
        if (isDemoMode) return;
        
        printerRefreshIcon.classList.add('spinning');
        refreshPrintersBtn.disabled = true;
        
        try {
            const res = await fetch(`${apiBaseUrl}/api/printers`);
            if (res.ok) {
                const printers = await res.json();
                populatePrintersDropdown(printers);
            }
        } catch (err) {
            showToast('נכשלה טעינת רשימת מדפסות', 'error');
        } finally {
            printerRefreshIcon.classList.remove('spinning');
            refreshPrintersBtn.disabled = false;
        }
    }

    function populatePrintersDropdown(printers) {
        // Keep first "default" option
        printerSelect.innerHTML = '<option value="default">מדפסת ברירת המחדל של מערכת ההפעלה</option>';
        printers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            printerSelect.appendChild(opt);
        });
    }

    async function loadJobsHistory() {
        if (isDemoMode) return;
        try {
            const res = await fetch(`${apiBaseUrl}/api/jobs`);
            if (res.ok) {
                const jobs = await res.json();
                printHistory = jobs;
                renderHistoryTable();
            }
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    }

    /* ==========================================================================
       UI INTERACTIVE CONTROLS
       ========================================================================== */
    
    // Save Settings
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const configData = {
            provider: emailProvider.value,
            host: imapHost.value || (emailProvider.value === 'gmail' ? 'imap.gmail.com' : 'outlook.office365.com'),
            port: parseInt(imapPort.value) || 993,
            user: emailAddress.value,
            pass: appPassword.value,
            folder: imapFolder.value,
            filterTag: filterTag.value,
            printer: printerSelect.value,
            interval: parseInt(checkInterval.value),
            deleteAfterPrint: deleteAfterPrint.checked
        };

        if (isDemoMode) {
            showToast('ההגדרות נשמרו בהצלחה (מצב סימולציה)!');
            return;
        }

        try {
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.innerHTML = '<i data-lucide="loader" class="spinning"></i> שומר הגדרות...';
            lucide.createIcons();

            const res = await fetch(`${apiBaseUrl}/api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData)
            });

            if (res.ok) {
                showToast('ההגדרות נשמרו בהצלחה בשרת!');
            } else {
                const err = await res.json();
                showToast(`שגיאה בשמירה: ${err.message}`, 'error');
            }
        } catch (err) {
            showToast('שגיאה בחיבור לשרת', 'error');
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.innerHTML = '<i data-lucide="save"></i> שמור הגדרות';
            lucide.createIcons();
        }
    });

    // Refresh Printers button Click
    refreshPrintersBtn.addEventListener('click', () => {
        if (isDemoMode) {
            printerRefreshIcon.classList.add('spinning');
            refreshPrintersBtn.disabled = true;
            setTimeout(() => {
                printerRefreshIcon.classList.remove('spinning');
                refreshPrintersBtn.disabled = false;
                showToast('רשימת המדפסות עודכנה (דמו)');
            }, 1000);
        } else {
            loadPrintersList();
        }
    });

    // Test Email Connection
    testConnectionBtn.addEventListener('click', async () => {
        const credentials = {
            provider: emailProvider.value,
            host: imapHost.value || (emailProvider.value === 'gmail' ? 'imap.gmail.com' : 'outlook.office365.com'),
            port: parseInt(imapPort.value) || 993,
            user: emailAddress.value,
            pass: appPassword.value
        };

        if (!credentials.user || !credentials.pass) {
            showToast('נא להזין כתובת מייל וסיסמה לבדיקה', 'warning');
            return;
        }

        testConnectionBtn.disabled = true;
        testConnectionBtn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> בודק חיבור...';
        lucide.createIcons();

        if (isDemoMode) {
            setTimeout(() => {
                testConnectionBtn.disabled = false;
                testConnectionBtn.innerHTML = '<i data-lucide="wifi"></i> בדיקת חיבור למייל';
                lucide.createIcons();
                showToast('החיבור הצליח! שרת ה-IMAP זמין ומאומת.', 'success');
            }, 1500);
            return;
        }

        try {
            const res = await fetch(`${apiBaseUrl}/api/test-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('חיבור המייל נבדק ועובד בהצלחה!', 'success');
            } else {
                showToast(`שגיאת התחברות: ${data.message || 'לא ניתן להתחבר'}`, 'error');
            }
        } catch (err) {
            showToast('נכשלה התקשורת עם השרת המקומי', 'error');
        } finally {
            testConnectionBtn.disabled = false;
            testConnectionBtn.innerHTML = '<i data-lucide="wifi"></i> בדיקת חיבור למייל';
            lucide.createIcons();
        }
    });

    // Test Print Page
    testPrintBtn.addEventListener('click', async () => {
        const selectedPrinterName = printerSelect.value;
        
        testPrintBtn.disabled = true;
        testPrintBtn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> שולח להדפסה...';
        lucide.createIcons();

        if (isDemoMode) {
            setTimeout(() => {
                testPrintBtn.disabled = false;
                testPrintBtn.innerHTML = '<i data-lucide="file-text"></i> הדפסת דף בדיקה';
                lucide.createIcons();
                showToast(`דף הבדיקה נשלח בהצלחה למדפסת: ${selectedPrinterName === 'default' ? 'ברירת מחדל' : selectedPrinterName}`, 'success');
            }, 1500);
            return;
        }

        try {
            const res = await fetch(`${apiBaseUrl}/api/test-print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printer: selectedPrinterName })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('דף הבדיקה נשלח להדפסה בהצלחה!', 'success');
            } else {
                showToast(`שגיאת מדפסת: ${data.message}`, 'error');
            }
        } catch (err) {
            showToast('שגיאה בתקשורת עם שרת ההדפסה', 'error');
        } finally {
            testPrintBtn.disabled = false;
            testPrintBtn.innerHTML = '<i data-lucide="file-text"></i> הדפסת דף בדיקה';
            lucide.createIcons();
        }
    });

    /* ==========================================================================
       AUTOMATION CONTROLS (Play/Stop/Sync)
       ========================================================================== */
    
    // Start Automation
    startServiceBtn.addEventListener('click', async () => {
        if (!isDemoMode) {
            try {
                const res = await fetch(`${apiBaseUrl}/api/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'start' })
                });
                if (res.ok) {
                    updateServiceStatusUI(true);
                    showToast('שירות האוטומציה הופעל בהצלחה בשרת!');
                }
            } catch (err) {
                showToast('נכשל חיבור לשרת', 'error');
            }
        } else {
            // Demo Mode start
            updateServiceStatusUI(true);
            showToast('שירות האוטומציה הופעל (מצב סימולציה)', 'success');
            startDemoInterval();
        }
    });

    // Stop Automation
    stopServiceBtn.addEventListener('click', async () => {
        if (!isDemoMode) {
            try {
                const res = await fetch(`${apiBaseUrl}/api/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'stop' })
                });
                if (res.ok) {
                    updateServiceStatusUI(false);
                    showToast('שירות האוטומציה הופסק');
                }
            } catch (err) {
                showToast('נכשל חיבור לשרת', 'error');
            }
        } else {
            // Demo Mode Stop
            updateServiceStatusUI(false);
            showToast('שירות האוטומציה הופסק (מצב סימולציה)', 'warning');
            stopDemoInterval();
        }
    });

    // Sync Now (Manual scan)
    syncNowBtn.addEventListener('click', async () => {
        syncNowBtn.disabled = true;
        syncNowBtn.innerHTML = '<i data-lucide="loader" class="spinning"></i> סורק מיילים...';
        lucide.createIcons();

        if (isDemoMode) {
            setTimeout(() => {
                syncNowBtn.disabled = false;
                syncNowBtn.innerHTML = '<i data-lucide="arrow-down-to-line"></i> בדיקת מיילים עכשיו';
                lucide.createIcons();
                
                // Randomly mock a print job or mock a skipped job
                const r = Math.random();
                if (r > 0.4) {
                    mockIncomingPrintJob();
                } else {
                    stats.skipped++;
                    updateStats();
                    showToast('סריקת המייל הושלמה. לא נמצאו מיילים חדשים להדפסה.', 'warning');
                }
            }, 1500);
            return;
        }

        try {
            const res = await fetch(`${apiBaseUrl}/api/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync' })
            });

            if (res.ok) {
                const data = await res.json();
                showToast(`הסנכרון הושלם! ${data.message}`, 'success');
                // Reload data
                const statusRes = await fetch(`${apiBaseUrl}/api/status`);
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    updateStats(statusData.stats);
                    loadJobsHistory();
                }
            } else {
                showToast('שגיאה במהלך הסנכרון', 'error');
            }
        } catch (err) {
            showToast('שגיאה בחיבור לשרת', 'error');
        } finally {
            syncNowBtn.disabled = false;
            syncNowBtn.innerHTML = '<i data-lucide="arrow-down-to-line"></i> בדיקת מיילים עכשיו';
            lucide.createIcons();
        }
    });

    // Clear logs History
    clearLogsBtn.addEventListener('click', async () => {
        if (!confirm('האם אתה בטוח שברצונך למחוק את כל היסטוריית ההדפסה מהלוח?')) return;

        if (isDemoMode) {
            printHistory = [];
            stats = { printed: 0, skipped: 0, failed: 0 };
            updateStats();
            renderHistoryTable();
            showToast('היסטוריית הפעילות נמחקה (דמו)');
            return;
        }

        try {
            const res = await fetch(`${apiBaseUrl}/api/jobs`, { method: 'DELETE' });
            if (res.ok) {
                printHistory = [];
                stats = { printed: 0, skipped: 0, failed: 0 };
                updateStats();
                renderHistoryTable();
                showToast('היסטוריית הפעילות נמחקה בהצלחה מהשרת!');
            }
        } catch (err) {
            showToast('שגיאה במחיקת היסטוריה', 'error');
        }
    });

    /* ==========================================================================
       UI RENDER HELPER FUNCTIONS
       ========================================================================== */
    function updateServiceStatusUI(running) {
        isServiceRunning = running;
        
        if (running) {
            globalStatusIndicator.className = 'status-indicator running';
            globalStatusText.textContent = 'שירות פעיל (ברקע)';
            servicePulse.classList.add('active');
            
            startServiceBtn.disabled = true;
            startServiceBtn.classList.add('disabled');
            stopServiceBtn.disabled = false;
            stopServiceBtn.classList.remove('disabled');
        } else {
            globalStatusIndicator.className = 'status-indicator stopped';
            globalStatusText.textContent = 'השירות כבוי';
            servicePulse.classList.remove('active');
            
            startServiceBtn.disabled = false;
            startServiceBtn.classList.remove('disabled');
            stopServiceBtn.disabled = true;
            stopServiceBtn.classList.add('disabled');
        }
    }

    function updateStats(newStats) {
        if (newStats) stats = newStats;
        statPrinted.textContent = stats.printed;
        statSkipped.textContent = stats.skipped;
        statFailed.textContent = stats.failed;
    }

    function renderHistoryTable() {
        if (printHistory.length === 0) {
            emptyLogsRow.style.display = 'table-row';
            // Remove any other rows
            const rows = logsTbody.querySelectorAll('tr:not(#empty-logs-row)');
            rows.forEach(r => r.remove());
            return;
        }

        emptyLogsRow.style.display = 'none';
        
        // Remove existing rows except empty state
        const rows = logsTbody.querySelectorAll('tr:not(#empty-logs-row)');
        rows.forEach(r => r.remove());

        // Add history rows (newest first)
        const sortedHistory = [...printHistory].reverse();
        sortedHistory.forEach(job => {
            const tr = document.createElement('tr');
            
            // Format Timestamp
            const dateStr = new Date(job.timestamp).toLocaleString('he-IL', {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            // Format Status Badge
            let badgeClass = 'badge-success';
            let statusText = 'הודפס';
            let iconName = 'check';
            
            if (job.status === 'FAILED') {
                badgeClass = 'badge-failed';
                statusText = 'שגיאה';
                iconName = 'x';
            } else if (job.status === 'SKIPPED') {
                badgeClass = 'badge-skipped';
                statusText = 'דולג';
                iconName = 'eye-off';
            }

            // Render attachment list
            let attachmentsHtml = '';
            if (job.attachments && job.attachments.length > 0) {
                job.attachments.forEach(att => {
                    attachmentsHtml += `
                        <span class="attachment-badge" title="${att.name} (${(att.size / 1024).toFixed(1)} KB)">
                            <i data-lucide="file"></i>
                            ${att.name.length > 18 ? att.name.substring(0, 16) + '...' : att.name}
                        </span>
                    `;
                });
            } else {
                attachmentsHtml = '<span style="color: var(--text-muted); font-size: 0.8rem;">אין קבצים</span>';
            }

            tr.innerHTML = `
                <td class="time-col">${dateStr}</td>
                <td>
                    <span class="sender-name">${job.senderName || job.sender.split('<')[0].trim()}</span>
                    <span class="sender-email">${job.sender}</span>
                </td>
                <td class="subject-col" title="${job.subject}">${job.subject}</td>
                <td>
                    <div class="attachments-col">
                        ${attachmentsHtml}
                    </div>
                </td>
                <td>
                    <span class="badge ${badgeClass}">
                        <i data-lucide="${iconName}"></i>
                        ${statusText}
                    </span>
                </td>
            `;
            
            logsTbody.appendChild(tr);
        });

        // Recreate icons in table
        lucide.createIcons();
    }

    /* ==========================================================================
       DEMO MODE INTERACTIVE SIMULATIONS
       ========================================================================== */
    function startDemoInterval() {
        stopDemoInterval();
        const intervalMs = parseInt(checkInterval.value) || 20000;
        
        // Polling simulation every few seconds
        autoCheckTimer = setInterval(() => {
            // 40% chance of receiving a printable email every check cycle
            if (Math.random() > 0.6) {
                mockIncomingPrintJob();
            } else {
                console.log('Demo Sync: no new printable emails.');
            }
        }, 15000);
    }

    function stopDemoInterval() {
        if (autoCheckTimer) {
            clearInterval(autoCheckTimer);
            autoCheckTimer = null;
        }
    }

    function mockIncomingPrintJob() {
        const mockEmails = [
            {
                sender: 'moti@mindcet.org',
                senderName: 'מוטי מזרחי',
                subject: '[PRINT] סיכום ישיבת פדגוגיה שבועית',
                attachments: [{ name: 'pedagogy_summary.pdf', size: 1045000 }]
            },
            {
                sender: 'yulia.b@cet.ac.il',
                senderName: 'יוליה ברקוביץ\'',
                subject: '[PRINT] טופס אישור נסיעה מאושר',
                attachments: [{ name: 'travel_approval_2026.png', size: 512000 }]
            },
            {
                sender: 'office@mindcet.org',
                senderName: 'משרד מיינדסט',
                subject: '[PRINT] קבלות מרוכזות לרכישת ציוד',
                attachments: [
                    { name: 'invoice_1094.pdf', size: 245000 },
                    { name: 'receipt_store.jpg', size: 890000 }
                ]
            }
        ];

        const email = mockEmails[Math.floor(Math.random() * mockEmails.length)];
        
        const newJob = {
            id: 'mock-' + Date.now(),
            timestamp: new Date().toISOString(),
            sender: email.sender,
            senderName: email.senderName,
            subject: email.subject,
            attachments: email.attachments,
            status: 'SUCCESS'
        };

        printHistory.push(newJob);
        stats.printed++;
        updateStats();
        renderHistoryTable();
        
        showToast(`התקבל מייל מתאים! הודפס בהצלחה קובץ מצורף מ-${email.senderName}`);
    }

    // Run connection probe on startup
    checkApiConnection();
});
