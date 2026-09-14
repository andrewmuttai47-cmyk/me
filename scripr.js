
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');

if (menuToggle && nav) {
	menuToggle.addEventListener('click', () => {
		const isOpen = nav.classList.toggle('open');
		menuToggle.setAttribute('aria-expanded', String(isOpen));
	});
}

function showFormStatus(form, message, isError = false) {
	const status = form.querySelector('[data-form-status]');
	if (status) {
		status.textContent = message;
		status.style.color = isError ? 'var(--coral)' : '';
	}
}

async function readApiResponse(response) {
	const text = await response.text();
	if (!text.trim()) {
		throw new Error(`The server returned an empty response (${response.status}). Start the app with "npm start" and try again.`);
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`The server returned an invalid response (${response.status}).`);
	}
}

document.querySelectorAll('form[data-auth]').forEach((form) => {
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const submitButton = form.querySelector('button[type="submit"]');
		submitButton.disabled = true;
		showFormStatus(form, 'Checking your details...');
		try {
			const response = await fetch(`/api/${form.dataset.auth}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
			const result = await readApiResponse(response);
			if (!response.ok) throw new Error(result.error || 'Unable to complete this request.');
			window.location.href = 'account.html';
		} catch (error) {
			showFormStatus(form, error.message, true);
			submitButton.disabled = false;
		}
	});
});

const emailForm = document.querySelector('form[data-email-form]');
if (emailForm) {
	emailForm.addEventListener('submit', (event) => {
		event.preventDefault();
		const values = Object.fromEntries(new FormData(emailForm));
		const subject = encodeURIComponent(`Seoul Create enquiry from ${values.name}`);
		const body = encodeURIComponent(`${values.message}\n\nReply to: ${values.email}`);
		window.location.href = `mailto:hello@seoulcreate.co.ke?subject=${subject}&body=${body}`;
	});
}

const accountName = document.querySelector('#account-name');
if (accountName) {
	fetch('/api/me').then(readApiResponse).then(({ user }) => {
		if (!user) return window.location.replace('login.html');
		accountName.textContent = `${user.name}.`;
		document.querySelector('#account-email').textContent = user.email;
	}).catch(() => window.location.replace('login.html'));
}

const logoutButton = document.querySelector('#logout-button');
if (logoutButton) {
	logoutButton.addEventListener('click', async () => {
		await fetch('/api/logout', { method: 'POST' });
		window.location.replace('login.html');
	});
}
