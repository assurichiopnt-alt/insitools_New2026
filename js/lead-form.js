// Sends "Request a Quotation" forms to the Google Apps Script lead endpoint,
// with WhatsApp offered as a follow-up (on success) or fallback (on failure).
//
// A form opts in with data-lead-form="<global function name>". That function
// returns either { error: '...' } or
// { lead: { product, name, company, email, phone, details }, whatsappMessage: '...' }.
// Elements marked data-lead-keep keep their value when the form is cleared.
(function () {
    const ENDPOINT = 'https://script.google.com/macros/s/AKfycbz1eV2JQnv4b4Hgo-6uY5RVX4Z3arty66ROV-Plef28stb7H92SviiE3ETrkblSeRQAlA/exec';
    const WHATSAPP_NUMBER = '6598183419';
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const SUCCESS_TEXT = 'Thank you! Our engineering sales team will contact you shortly.';
    const FAILURE_TEXT = 'Sorry, we could not send your request. Please check your internet connection and try again, or send it to us on WhatsApp.';

    const STATUS_STYLES = {
        success: 'mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800',
        error: 'mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'
    };

    function getStatusBox(form) {
        let box = form.querySelector('[data-lead-status]');
        if (!box) {
            box = document.createElement('div');
            box.setAttribute('data-lead-status', '');
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            form.append(box);
        }
        return box;
    }

    function hideStatus(form) {
        const box = form.querySelector('[data-lead-status]');
        if (box) {
            box.replaceChildren();
            box.className = 'hidden';
        }
    }

    function showStatus(form, type, text, whatsappMessage) {
        const box = getStatusBox(form);
        box.className = STATUS_STYLES[type];

        const message = document.createElement('p');
        message.className = 'font-semibold';
        message.textContent = text;
        box.replaceChildren(message);

        if (whatsappMessage) {
            const link = document.createElement('a');
            link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'inline-block mt-3 bg-[#25D366] hover:bg-[#1ebe5b] text-white text-xs font-bold py-2 px-4 rounded uppercase tracking-wider transition';
            link.textContent = 'Chat with us on WhatsApp';
            box.append(link);
        }
    }

    function validate(lead) {
        if (!lead.name) {
            return 'Please enter your contact name.';
        }
        if (!lead.email && !lead.phone) {
            return 'Please enter an email address or a phone number so we can reach you.';
        }
        if (lead.email && !EMAIL_PATTERN.test(lead.email)) {
            return 'Please enter a valid email address.';
        }
        return '';
    }

    function clearForm(form) {
        const kept = Array.from(form.querySelectorAll('[data-lead-keep]'), field => [field, field.value]);
        form.reset();
        kept.forEach(([field, value]) => {
            field.value = value;
        });
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const collect = window[form.dataset.leadForm];
        const submitButton = form.querySelector('[type="submit"]');
        if (typeof collect !== 'function' || submitButton.disabled) {
            return;
        }

        const result = collect(form) || {};
        if (result.error) {
            showStatus(form, 'error', result.error);
            return;
        }

        const lead = {};
        ['product', 'name', 'company', 'email', 'phone', 'details'].forEach(key => {
            lead[key] = String((result.lead || {})[key] || '').trim();
        });

        const validationError = validate(lead);
        if (validationError) {
            showStatus(form, 'error', validationError);
            return;
        }

        const honeypot = form.querySelector('input[name="website"]');
        const payload = new URLSearchParams({
            ...lead,
            page: location.pathname + location.search,
            website: honeypot ? honeypot.value : ''
        });

        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
        hideStatus(form);

        try {
            await fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: payload });
            // GA4: count the lead (product only – no personal data is sent to Google)
            if (typeof window.gtag === 'function') {
                window.gtag('event', 'generate_lead', {
                    product_name: lead.product || 'General',
                    form_page: location.pathname
                });
            }
            clearForm(form);
            showStatus(form, 'success', SUCCESS_TEXT, result.whatsappMessage);
        } catch (error) {
            showStatus(form, 'error', FAILURE_TEXT, result.whatsappMessage);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    }

    document.querySelectorAll('form[data-lead-form]').forEach(form => {
        form.addEventListener('submit', handleSubmit);
        form.addEventListener('reset', () => hideStatus(form));
    });
})();
