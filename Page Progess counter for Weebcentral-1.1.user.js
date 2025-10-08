// ==UserScript==
// @name         Page Progess counter for Weebcentral
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Shows "current page/total pages" on the bottom-left of the window for reading websites. Stays a constant size when zooming.
// @author       Nirmal Bhasarkar
// @license      MIT
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const config = {
        // --- DEBUGGING ---
        // Set to true to show console logs if the script stops working.
        debug: false,

        // --- POSITIONING ---
        counterPosition: {
            bottom: '2px', // Modify this two values to move the box location
            left: '5px'
        },

        // --- TOTAL PAGES (Selector for one-time scan) ---
        totalPagesSelector: "button[\\@click*='page =']",
        totalPagesTextSelector: ".page-info, #page-count, .total-pages, .last-page",

        // --- CURRENT PAGE (Selector for frequent updates) ---
        currentPageImageSelector: ".viewer-image img, #main-image, img[src*=\"scans\"], .comic-page img, .manga-page, .page-content img",
    };
    // --- End of Configuration ---

    let pageCounterElement;
    let cachedTotalPages = null;
    let observer;

    function log(...args) {
        if (config.debug) {
            console.log('[Page Counter]', ...args);
        }
    }

    // This debounce implementation ensures each debounced function has its own timer.
    function debounce(func, delay) {
        let debounceTimer;
        return function(...args) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function createCounterElement() {
        if (document.getElementById('page-counter-userscript')) return;

        pageCounterElement = document.createElement('div');
        pageCounterElement.id = 'page-counter-userscript';

        // Custom styling for the counter box
        Object.assign(pageCounterElement.style, {
            position: 'fixed',
            bottom: config.counterPosition.bottom,
            left: config.counterPosition.left,
            color: 'rgba(255, 255, 255, 0.5)',           //Adjust 0.8 to increase or decrease text brightness
            padding: '5px 7px',
            borderRadius: '0px',
            border: '0.3px solid rgba(1, 1, 12, 0.0)',  //Set 01.0 to 0.0 to hide the border
            backgroundColor: 'rgba(73, 83, 89, 0.0)',   //Set 01.0 to 0.0 to hide the background
            zIndex: '99999',
            fontSize: '17px',
            fontFamily: 'Inter, sans-serif',
            fontWeight: '525',
            transition: 'opacity 0.0s',
            opacity: '0.8',
            pointerEvents: 'none',
        });
        document.body.appendChild(pageCounterElement);
    }

    /**
     * Adjusts the counter's scale to counteract browser zoom, keeping its size constant.
     */
    function adjustForZoom() {
        if (!pageCounterElement) return;
        const zoomLevel = window.devicePixelRatio || 1;
        const scale = 1 / zoomLevel;
        pageCounterElement.style.transform = `scale(${scale})`;
        pageCounterElement.style.transformOrigin = 'bottom left';
    }

    /**
     * Finds the total number of pages ONCE and caches the result.
     */
    function findAndCacheTotalPages() {
        if (cachedTotalPages !== null) {
            return cachedTotalPages;
        }
        log("Scanning for total pages (one-time operation)...");
        try {
            const pageButtons = document.querySelectorAll(config.totalPagesSelector);
            if (pageButtons.length > 0) {
                cachedTotalPages = pageButtons.length;
                log("Total pages found and cached:", cachedTotalPages);
                return cachedTotalPages;
            }
        } catch (e) { log("Error with totalPagesSelector", e); }
        log("Could not determine total pages.");
        return null;
    }

    /**
     * Finds the current page number. This is run more frequently.
     */
    function getCurrentPage() {
        log("Searching for current page...");
        // Strategy 1: Look for page number in the URL
        try {
            const url = window.location.href;
            const urlMatch = url.match(/(?:\/page\/|\/|-)(\d+)(?:\.html|\/)?(?:$|\?)/) || url.match(/[?&](?:page|p|c)=(\d+)/);
            if (urlMatch && urlMatch[1]) {
                const pageNum = parseInt(urlMatch[1], 10);
                log("Current page found (from URL):", pageNum);
                return pageNum;
            }
        } catch (e) { log("Error parsing URL", e); }

        // Strategy 2: Find the visible page image and check its attributes or filename
        try {
            const images = Array.from(document.querySelectorAll(config.currentPageImageSelector));
            log(`Found ${images.length} potential page images with selector: "${config.currentPageImageSelector}"`);
            for (const img of images) {
                const rect = img.getBoundingClientRect();
                if (rect.top < window.innerHeight && rect.bottom > 0) { // Check if visible
                    // Strategy 2a: Check for a 'data-page-number' attribute on the image or its parent
                    const container = img.closest('div[data-page-number], li[data-page-number]');
                    if (container && container.dataset.pageNumber) {
                        const pageNum = parseInt(container.dataset.pageNumber, 10);
                        log("Current page found (from parent data-page-number):", pageNum);
                        return pageNum;
                    }

                    // Strategy 2b: Check the image's filename
                    const src = img.src || img.dataset.src;
                    if (!src) continue;
                    const filenameMatch = src.match(/(\d+)\.(jpg|jpeg|png|webp|gif)/i);
                    if (filenameMatch && filenameMatch[1]) {
                        const pageNum = parseInt(filenameMatch[1], 10);
                        log("Current page found (from visible image filename):", pageNum);
                        return pageNum;
                    }
                }
            }
        } catch (e) { log("Error with currentPageImageSelector", e); }

        log("Could not determine current page.");
        return null;
    }

    /**
     * Updates the counter display.
     */
    function updatePageCount() {
        if (!pageCounterElement) return;
        log("--- Updating Page Count ---");
        const current = getCurrentPage();
        const total = cachedTotalPages; // Use the cached value

        log(`Result -> Current: ${current}, Total: ${total}`);
        if (current !== null || total !== null) {
            const currentStr = current !== null ? current : '?';
            const totalStr = total !== null ? total : '?';
            pageCounterElement.textContent = `${currentStr}/${totalStr}`; // MODIFY this to change the display text.
            pageCounterElement.style.opacity = '1';
        } else {
             pageCounterElement.style.opacity = '0';
        }
    }

    const debouncedUpdate = debounce(updatePageCount, 250);

    function init() {
        log("Initializing Page Counter script.");
        createCounterElement();
        adjustForZoom(); // Set the initial scale based on current zoom

        // Find total pages once after the page loads
        findAndCacheTotalPages();

        // Then, set up the observer to only update the current page
        observer = new MutationObserver(() => {
            log("DOM changed, queueing re-check for CURRENT page.");
            debouncedUpdate();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Listen for resize/zoom events to keep the counter size consistent
        window.addEventListener('resize', debounce(adjustForZoom, 100));

        // Run an initial update
        updatePageCount();
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();