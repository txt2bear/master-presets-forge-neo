// Master Presets — bridge layer.
// Owns ALL contact with the Forge/Gradio DOM: value reading, native setters,
// Svelte dropdown selection, UI-preset settle waits. No UI, state or i18n logic
// lives here; master_presets.js consumes it via window.MasterPresetsBridge.
//
// IMPORTANT: this file must load BEFORE master_presets.js. Forge loads extension
// javascript files in alphabetical order (modules/extensions.py list_files), and
// "bridge.js" sorts before "master_presets.js". Renaming it can break the extension.
(() => {
    "use strict";

    const controlIds = {
        global: {
            forgePreset: "forge_ui_preset",
            checkpoint: "setting_sd_model_checkpoint",
            modules: "setting_sd_modules",
            dtype: "forge_ui_dtype",
        },
        txt2img: {
            width: "txt2img_width",
            height: "txt2img_height",
            steps: "txt2img_steps",
            cfg: "txt2img_cfg_scale",
            distilledCfg: "txt2img_distilled_cfg_scale",
            sampler: "txt2img_sampling",
            scheduler: "txt2img_scheduler",
            styles: "txt2img_styles",
            prompt: "txt2img_prompt",
            negativePrompt: "txt2img_neg_prompt",
            seed: "txt2img_seed",
            hires: {
                enabled: "txt2img_hr",
                upscaler: "txt2img_hr_upscaler",
                steps: "txt2img_hires_steps",
                denoise: "txt2img_denoising_strength",
                scale: "txt2img_hr_scale",
            },
        },
        img2img: {
            width: "img2img_width",
            height: "img2img_height",
            steps: "img2img_steps",
            cfg: "img2img_cfg_scale",
            distilledCfg: "img2img_distilled_cfg_scale",
            sampler: "img2img_sampling",
            scheduler: "img2img_scheduler",
            styles: "img2img_styles",
            prompt: "img2img_prompt",
            negativePrompt: "img2img_neg_prompt",
            seed: "img2img_seed",
        },
    };

    function root() {
        return typeof gradioApp === "function" ? gradioApp() : document;
    }

    function getRoot(id) {
        return root().getElementById(id) || document.getElementById(id);
    }

    function visibleInput(component) {
        if (!component) return null;
        const selectors = [
            "textarea",
            "select",
            'input[type="number"]',
            'input[type="range"]',
            'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
        ];
        for (const selector of selectors) {
            const el = component.matches?.(selector) ? component : component.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function normalizeText(value) {
        return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function readDropdownTokens(component) {
        if (!component) return [];
        const candidates = component.querySelectorAll(
            '[class*="token"], [class*="selected-item"], [data-testid*="token"], [data-testid*="selected"]'
        );
        const values = [];
        for (const node of candidates) {
            const text = normalizeText(node.textContent)
                .replace(/^[×✕x]\s*/i, "")
                .replace(/\s*[×✕x]$/i, "")
                .trim();
            if (text && text.length < 300 && !values.includes(text)) values.push(text);
        }
        return values;
    }

    function readValue(id, options = {}) {
        const component = getRoot(id);
        if (!component) return options.multi ? [] : null;

        if (options.multi) {
            const tokens = readDropdownTokens(component);
            if (tokens.length) return tokens;
        }

        const input = visibleInput(component);
        if (!input) return options.multi ? [] : null;

        if (input.tagName === "SELECT") {
            if (options.multi) {
                return Array.from(input.selectedOptions).map((o) => o.value);
            }
            return input.value;
        }

        const value = input.value;
        if (options.numeric) {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        }
        if (options.multi) {
            return value ? [value] : [];
        }
        return value;
    }

    function nativeSetValue(input, value) {
        const proto = Object.getPrototypeOf(input);
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor?.set) descriptor.set.call(input, value);
        else input.value = value;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        if (typeof window.updateInput === "function") {
            try { window.updateInput(input); } catch (_) { /* optional */ }
        }
    }

    function setSimpleValue(id, value) {
        if (value === null || value === undefined) return false;
        const component = getRoot(id);
        const input = visibleInput(component);
        if (!input) return false;
        nativeSetValue(input, value);
        return true;
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Anatomy of a model reference: "dir/name.ext [hash]", every part optional.
    // Dropdown labels and saved values omit parts in different combinations
    // (the folder is dropped by the short-dropdown setting, the hash is shown
    // only once it is computed). Parts stated on BOTH sides must agree; a part
    // omitted on one side is compatible with any value of that part.
    function parseModelRef(value) {
        let s = normalizeText(value);
        if (!s) return null;
        let hash = null;
        const hashMatch = s.match(/\[([0-9a-fA-F]+)\]\s*$/);
        if (hashMatch) {
            hash = hashMatch[1].toLowerCase();
            s = s.substring(0, hashMatch.index).trim();
        }
        let dir = null;
        s = s.replace(/\\/g, "/");
        const slash = s.lastIndexOf("/");
        if (slash >= 0) {
            dir = s.substring(0, slash).toLowerCase();
            s = s.substring(slash + 1);
        }
        let ext = null;
        const extMatch = s.match(/\.(safetensors|ckpt|pt|pth|bin|sft|gguf)$/i);
        if (extMatch) {
            ext = extMatch[1].toLowerCase();
            s = s.substring(0, s.length - extMatch[0].length);
        }
        const name = s.trim().toLowerCase();
        if (!name) return null;
        return { dir, ext, hash, name };
    }

    function optionMatches(nodeText, wanted) {
        const a = parseModelRef(nodeText);
        const b = parseModelRef(wanted);
        if (!a || !b) return false;
        // model.ckpt and model.safetensors are different files; two different
        // hashes are different snapshots; A/name and B/name are different
        // folders. Substring matching is deliberately NOT used: Forge has
        // prefix families (Euler / Euler a, DPM++ 2M / DPM++ 2M SDE) where
        // substring equality would silently keep the wrong value.
        if (a.hash && b.hash && a.hash !== b.hash) return false;
        if (a.ext && b.ext && a.ext !== b.ext) return false;
        if (a.dir && b.dir && a.dir !== b.dir) return false;
        return a.name === b.name;
    }

    // Gradio 4.40 renders the options <ul> INSIDE the dropdown component
    // subtree: Block puts elem_id on its root (atoms/src/Block.svelte), and
    // DropdownOptions renders <ul class="options"> next to the input inside
    // that root (position:fixed is only visual). Searching any further would
    // click options of a NEIGHBORING dropdown, so the component is the only
    // source; no rendered options means "not open yet" and the caller retries.
    function findOption(wanted, scope) {
        if (!scope || typeof scope.querySelectorAll !== "function") return null;
        const nodes = scope.querySelectorAll('li[data-testid="dropdown-option"][data-index]');
        let exact = null;
        let exactCount = 0;
        let partial = null;
        let partialCount = 0;
        for (const node of nodes) {
            const candidate = node.getAttribute("aria-label") || normalizeText(node.textContent).replace(/^✓\s*/, "");
            if (!candidate) continue;
            if (normalizeText(candidate) === normalizeText(wanted)) {
                exactCount += 1;
                if (!exact) exact = node;
                continue;
            }
            if (optionMatches(candidate, wanted)) {
                partialCount += 1;
                if (!partial) partial = node;
            }
        }
        // An ambiguous list (e.g. two checkpoints with the same filename in
        // different folders, or a short label fitting several hashed options)
        // must not be resolved arbitrarily; the caller reports a failure
        // instead of picking the first lookalike.
        if (exactCount === 1) return exact;
        if (exactCount > 1) return null;
        return partialCount === 1 ? partial : null;
    }

    // Gradio 4.40 Dropdown is a Svelte component. Its value changes only when a real
    // li[data-testid="dropdown-option"] is selected; assigning input.value does not
    // update Svelte state. The parent <ul> listens for the option's mousedown event.
    async function pickDropdownOption(id, wanted, options = {}) {
        if (wanted === null || wanted === undefined || wanted === "") return true;
        const component = getRoot(id);
        if (!component) return false;
        const timeoutMs = Number(options.timeoutMs) || 8000;
        const deadline = Date.now() + timeoutMs;

        // Gradio 4.40: a single Dropdown renders input[role="listbox"], while a
        // Multiselect has a plain filter input and keeps the value as .token
        // elements — its input.value is only the filter text and is cleared
        // after every pick (add_or_remove_index sets input_text = ""). Success
        // must therefore be checked against the token list; checking input.value
        // would never see the pick and a repeated mousedown would TOGGLE the
        // option back off.
        const listboxInput = component.querySelector('input[role="listbox"]');
        const isMulti = !listboxInput;
        const selectedOk = () => {
            if (!isMulti) return optionMatches(dropdownValue(id), wanted);
            return readDropdownTokens(component).some((token) => optionMatches(token, wanted));
        };

        while (Date.now() < deadline) {
            const input = listboxInput || visibleInput(component);
            if (!input) return false;
            if (selectedOk()) return true;

            input.focus(); // Svelte handle_focus opens and renders the options list
            input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
            await sleep(120);

            const option = findOption(wanted, component);
            if (option) {
                option.dispatchEvent(new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                }));
                await sleep(220);
                if (isMulti) {
                    // A pick toggles the token; the result is visible in the tokens.
                    if (selectedOk()) return true;
                } else {
                    // While the typed filter text is still displayed and the options
                    // list is still open, nothing has actually been selected yet.
                    const listOpen = component.querySelectorAll('li[data-testid="dropdown-option"][data-index]').length > 0;
                    const typedStill = input.value === String(wanted);
                    if (optionMatches(input.value, wanted) && (!typedStill || !listOpen)) return true;
                }
            } else {
                // Filterable dropdown: type the wanted label to narrow the real option list.
                const readonly = input.readOnly;
                if (!readonly) {
                    const previous = input.value;
                    nativeSetValue(input, String(wanted));
                    await sleep(120);
                    const filtered = findOption(wanted, component);
                    if (filtered) {
                        filtered.dispatchEvent(new MouseEvent("mousedown", {
                            bubbles: true, cancelable: true, view: window, button: 0,
                        }));
                        await sleep(220);
                        if (selectedOk()) return true;
                    }
                    // Restore the previous value so the typed text is never
                    // mistaken for a selected option on the next loop pass.
                    if (input.value !== previous) nativeSetValue(input, previous);
                }
            }
            await sleep(180);
        }
        return false;
    }

    // Back-compat wrapper still used by the multi-select helper.
    async function chooseDropdownValue(id, value) {
        return pickDropdownOption(id, value, { timeoutMs: 3000 });
    }

    function dropdownValue(id) {
        const component = getRoot(id);
        if (!component) return null;
        const input = component.querySelector('input[role="listbox"]') || visibleInput(component);
        return input ? input.value : null;
    }

    // Set comparison for FILENAMED items (VAE / text encoders): every entry
    // matches through optionMatches, so folder / extension / hash parts must
    // agree whenever both sides state them, and stay compatible when one side
    // omits them.
    function sameTokenSet(current, wanted) {
        const a = Array.isArray(current) ? current.slice() : [];
        const b = Array.isArray(wanted) ? wanted : [];
        if (a.length !== b.length) return false;
        for (const value of b) {
            const idx = a.findIndex((item) => optionMatches(item, value));
            if (idx < 0) return false;
            a.splice(idx, 1);
        }
        return true;
    }

    function setNumericIfChanged(id, value) {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
        const current = readValue(id, { numeric: true });
        if (current === Number(value)) return;
        setSimpleValue(id, value);
    }

    function presetSignature() {
        const global = controlIds.global;
        return [
            readValue(global.forgePreset),
            readValue(global.checkpoint),
            readValue("txt2img_width"),
            readValue("txt2img_height"),
            readValue("txt2img_sampling"),
        ].join("|");
    }

    // Wait until a UI Preset change has fully landed on the client. Forge Neo's
    // on_preset_change asynchronously resets checkpoint / width / height / sampler /
    // scheduler to that preset's stored defaults; we must apply our own values AFTER it.
    async function waitForPresetSettle(wantedPreset) {
        const timeoutMs = 12000;
        const stableMs = 800;
        const graceMs = 1800;
        const start = Date.now();
        let last = null;
        let stableSince = null;
        let sawChange = false;
        const wanted = wantedPreset == null ? null : String(wantedPreset).trim();
        while (Date.now() - start < timeoutMs) {
            const presetNow = readValue(controlIds.global.forgePreset);
            const presetReady = wanted == null || (presetNow != null && String(presetNow).trim() === wanted);
            const sig = presetSignature();
            if (sig !== last) {
                if (last !== null) sawChange = true;
                last = sig;
                stableSince = Date.now();
            }
            if (stableSince != null
                && Date.now() - start >= graceMs
                && Date.now() - stableSince >= stableMs
                && (presetReady || sawChange)) {
                return true;
            }
            await sleep(200);
        }
        return false;
    }

    async function clearMultiSelect(component) {
        if (!component) return;
        // Gradio 4.40 renders the per-token remove control as
        // div[role="button"].token-remove (title "Remove <index>"), plus a
        // remove-all div; older versions used real buttons. Cover both.
        const buttons = component.querySelectorAll(
            'button[aria-label*="remove" i], button[aria-label*="delete" i],'
            + ' button[title*="remove" i], button[title*="delete" i],'
            + ' [role="button"].token-remove'
        );
        for (const button of Array.from(buttons)) {
            button.click();
            await sleep(30);
        }
    }

    async function setMultiDropdown(id, values, sameSet = sameTokenSet) {
        const component = getRoot(id);
        if (!component) return false;
        await clearMultiSelect(component);
        for (const value of values || []) {
            await chooseDropdownValue(id, value);
            await sleep(100);
        }
        // Report partial application truthfully: a missing module must surface as
        // "check these" in the apply toast, not silently pass as a success.
        const current = readValue(id, { multi: true });
        if (!sameSet(current, values)) {
            console.warn(`[Master Presets] ${id}: wanted [${(values || []).join(", ") || "none"}], `
                + `got [${(current || []).join(", ") || "none"}]`);
            return false;
        }
        return true;
    }

    function readCurrentSize(tab) {
        const ids = controlIds[tab];
        const width = readValue(ids.width, { numeric: true });
        const height = readValue(ids.height, { numeric: true });
        if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
        return { width, height };
    }

    // Checkboxes are excluded from visibleInput(), so they need their own accessors.
    function checkboxValue(id) {
        const input = getRoot(id)?.querySelector('input[type="checkbox"]');
        return input ? input.checked : null;
    }

    function setCheckbox(id, checked) {
        const input = getRoot(id)?.querySelector('input[type="checkbox"]');
        if (!input || input.checked === checked) return true;
        input.checked = checked;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    window.MasterPresetsBridge = {
        controlIds,
        getRoot,
        visibleInput,
        normalizeText,
        readValue,
        setSimpleValue,
        sleep,
        optionMatches,
        pickDropdownOption,
        dropdownValue,
        sameTokenSet,
        setNumericIfChanged,
        waitForPresetSettle,
        setMultiDropdown,
        readCurrentSize,
        checkboxValue,
        setCheckbox,
    };
})();
