/**
 * Browser half of `dsh-show-balance`.
 *
 * Shows the DeepSeek account balance (CNY) as one dock cell, placed LEFT of the
 * prefill-speed strip. It renders nothing at all while the account is signed out,
 * so the row simply does not carry a balance pill.
 *
 * ## This bundle must never fail the boot audit
 *
 * The deployment refuses to start when a single Loader entry does not activate.
 * Two shapes in this file exist for that rule alone:
 *
 * 1. `loader.load` is called inside a `try`: the module system may serve this
 *    package from a batch script that registers several packages in sequence, and
 *    a throw here would stop the packages written after this one from registering.
 * 2. The `ctx.slots.inject` callback carries its OWN `try`. That callback runs
 *    INSIDE the slot owner's `register()` call (the moment ui-conversation declares
 *    `conversation.composer.dock`), so a throw escaping it fails THAT entry's
 *    activation — not this plugin's — and takes the whole startup down with it.
 *
 * ## Where the number comes from
 *
 * `ctx.get('remote.account')` — the same authenticated Remote the shipped
 * Settings -> Account section reads through `ctx.remote.account`. It is resolved on
 * EVERY read rather than once during activation: the client registers remote
 * namespaces while it connects, so a lookup taken during activation can
 * legitimately come back empty on a page that boots first. A missing account and a
 * signed-out account both answer `null`, which is exactly the hidden state this
 * strip needs; there is no separate sign-in probe.
 *
 * `metadata` is local identity only (build version, UI locale, UTC offset). The
 * shipped client takes the version from a build-time define this bundle does not
 * have, so it sends a placeholder: the Host forwards these fields as Platform
 * request headers, and the balance query is authorized by the stored grant, not
 * by them.
 *
 * ## Registration
 *
 * A CLASSIC SCRIPT registering a lazy CJS factory, like every shipped bundle.
 * `dsh-client-modules` snapshots the bundle BYTES at boot composition and keys its
 * response cache by the artifact revision, so a running application keeps serving
 * the bytes it composed with: judging an edit needs a FULL RESTART, because a
 * refresh and a plugin disable/enable cycle both keep the composed revision.
 *
 * ## Why the whole bundle is one IIFE
 *
 * A combo script concatenates SEVERAL packages' `client.js` into one classic
 * script, and classic scripts share the global lexical scope. A top-level
 * `const`/`let` here therefore collides with the same identifier in any other
 * hand-written bundle: the browser throws
 * `Uncaught SyntaxError: Identifier 'X' has already been declared`, NOTHING in
 * that script registers, and the boot audit refuses the whole startup with
 * `<package>: import failed`. Function declarations are as bad in a different
 * way — the last one wins for every bundle in the combo, so one package's
 * warnings get another package's tag. Shipped bundles never leak because their
 * build wraps the CJS output; this hand-written one wraps itself.
 *
 * The body stays at column 0 inside the wrapper deliberately: this file is
 * written as a flat top-level script, and the wrapper is the one line that must
 * never be lost in an edit.
 */
(function () {
/** One warning per key per page: a broken strip must not spam the console. */
const REPORTED = new Set();

/** @param {string} message */
function report(message) {
	try {
		// eslint-disable-next-line no-console
		console.warn("[show-balance] " + message);
	} catch (ignored) {
		// A console that throws is not worth a second thought.
	}
}

/** @param {unknown} error */
function describeError(error) {
	if (error === null || error === undefined) return String(error);
	return error.message === undefined ? String(error) : String(error.message);
}

/** @param {string} key @param {string} message */
function reportOnce(key, message) {
	if (REPORTED.has(key)) return;
	REPORTED.add(key);
	report(message);
}

const loader = typeof window === "undefined" ? undefined : window.__ModuleLoader__;

if (loader === undefined || loader === null || typeof loader.load !== "function") {
	report("module loader is absent; the bundle registered nothing");
} else {
	try {
		loader.load({
			id: "dsh-show-balance",
			factory: (require) => {
				var module = { exports: {} };
				var exports = module.exports;

				try {
					build(require, exports);
				} catch (error) {
					// An inert plugin still activates, which keeps the boot audit satisfied:
					// the application refuses to start when any entry fails to activate.
					reportOnce("build", "bundle body failed, staying inert: " + describeError(error));
					exports.apply = function apply() {};
					exports.inject = [];
				}

				return module.exports;
			}
		});
	} catch (error) {
		// Reachable when this id already sits in the factory table (the module system
		// served a batch script that registered it, then this one-resource URL). The
		// factory exists either way, so the row still activates; swallowing the
		// duplicate keeps the remaining packages of a batch script loading.
		reportOnce("register", "bundle registration was refused: " + describeError(error));
	}
}

/**
 * The module body.
 *
 * @param {(specifier: string) => any} require
 * @param {any} exports
 */
function build(require, exports) {
	const React = require("react");
	if (React === undefined || React === null || typeof React.createElement !== "function") {
		throw new Error("react did not resolve to a React runtime");
	}
	// `react-dom` is a platform seed word. The dialog is portaled to
	// `document.body` exactly as the shipped one is: inside the composer's
	// stacking and transform contexts a `position: fixed` child would be placed
	// against the wrong box.
	const createPortal = (() => {
		try {
			const reactDom = require("react-dom");
			return reactDom !== null && typeof reactDom.createPortal === "function" ? reactDom.createPortal : null;
		} catch (error) {
			return null;
		}
	})();

	/** The dock cell. `order` decides the position; the prefill strip sits at -1. */
	const SLOT = "conversation.composer.dock";
	const SLOT_ID = "account-balance";
	const SLOT_ORDER = -2;
	/** Poll interval: a balance changes on spend, so a slow refresh is enough. */
	const REFRESH_MS = 30_000;

	/**
	 * Stylesheet, rendered by the component itself. The pill geometry is copied
	 * from the shipped session-statistics pill (`StatsPills.module.css`) so a row
	 * carrying both strips reads as one line; the dialog reuses the shipped
	 * `stat-dialog.module.css` values, whose title row has no close button.
	 */
	const CSS =
		".dshbal_root{box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;gap:12px;display:flex}" +
		".dshbal_pill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer}" +
		".dshbal_pill svg{flex:none;width:14px;height:14px}" +
		".dshbal_pill:hover,.dshbal_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}" +
		".dshbal_label{text-overflow:ellipsis;min-width:0;overflow:hidden}" +
		".dshbal_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}" +
		".dshbal_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}" +
		".dshbal_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}" +
		".dshbal_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}" +
		".dshbal_titleLabel svg{flex:none;width:14px;height:14px}" +
		".dshbal_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}" +
		".dshbal_details dt,.dshbal_details dd{min-width:0;margin:0}" +
		".dshbal_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}";

	/** Viewport margin the placement clamp keeps, and the gap above the trigger. */
	const PANEL_MARGIN = 12;
	const PANEL_GAP = 8;
	/** Unplaced portal panel: hidden but laid out so the clamp can measure it. */
	const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };

	const DICTIONARIES = {
		zh: {
			title: "账户余额",
			recharge: "充值余额",
			bonus: "赠金余额",
			total: "合计",
			// Chinese copy writes the unit; the English copy keeps the ISO code.
			yuan: "元"
		},
		en: {
			title: "Account balance",
			recharge: "Topped-up",
			bonus: "Granted",
			total: "Total",
			yuan: "CNY"
		}
	};

	/**
	 * The strip is a slot occupant, so it receives no translator. The language is
	 * read from the document at render time, which also follows a locale switch.
	 */
	function copy() {
		try {
			const explicit = typeof document === "undefined" ? null : document.documentElement.getAttribute("lang");
			const tag = explicit === null || explicit === undefined ? (typeof navigator === "undefined" ? null : navigator.language) : explicit;
			return String(tag === null || tag === undefined ? "en" : tag).toLowerCase().indexOf("zh") === 0 ? DICTIONARIES.zh : DICTIONARIES.en;
		} catch (error) {
			return DICTIONARIES.en;
		}
	}

	/**
	 * Currency label for one wallet: Chinese copy writes the unit, English copy
	 * keeps the ISO code. Any other currency keeps its own code in both languages —
	 * `元` would misname a dollar balance.
	 *
	 * @param {any} t @param {string} currency
	 */
	function currencyLabel(t, currency) {
		return currency === "CNY" ? t.yuan : currency;
	}

	/**
	 * Platform client identity for one account call. The Host turns these into
	 * Platform request headers; the browser sends no credential.
	 */
	function clientMetadata() {
		return {
			// The shipped client reads a build-time define this bundle does not have.
			// The field is a header value, not an authorization input.
			version: "dsh-desktop",
			locale: typeof navigator === "undefined" || navigator.language === undefined ? "en" : navigator.language,
			// Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
			timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
		};
	}

	/**
	 * One wallet amount as two fixed decimals. `Big`-style decimal strings can
	 * carry an exponent (`0E-16`), which `Number` reads correctly.
	 *
	 * @param {any} wallet
	 */
	function amount(wallet) {
		const value = Number(wallet === null || wallet === undefined ? NaN : wallet.balance);
		return Number.isFinite(value) ? value.toFixed(2) : null;
	}

	/**
	 * One `amount currency` phrase per currency, with the amounts summed inside each
	 * currency. Platform may report wallets in more than one currency, and adding
	 * those numbers together would invent an exchange rate that does not exist.
	 *
	 * @param {any} wallets
	 * @param {any} t
	 */
	function walletText(wallets, t) {
		if (!Array.isArray(wallets) || wallets.length === 0) return null;
		const totals = new Map();
		for (const wallet of wallets) {
			const value = Number(wallet === null || wallet === undefined ? NaN : wallet.balance);
			if (!Number.isFinite(value)) continue;
			const currency = typeof wallet.currency === "string" ? wallet.currency : "CNY";
			totals.set(currency, (totals.get(currency) || 0) + value);
		}
		const parts = [];
		for (const entry of totals) parts.push(entry[1].toFixed(2) + " " + currencyLabel(t, entry[0]));
		return parts.length === 0 ? null : parts.join(" + ");
	}

	/**
	 * Pick the wallet to display as the headline: CNY when present (this strip is
	 * the yuan one), else the first wallet the account reports.
	 *
	 * @param {any} wallets
	 */
	function pickWallet(wallets) {
		if (!Array.isArray(wallets) || wallets.length === 0) return null;
		for (const wallet of wallets) {
			if (wallet !== null && wallet !== undefined && wallet.currency === "CNY") return wallet;
		}
		return wallets[0] === undefined ? null : wallets[0];
	}

	/**
	 * Yuan outline: the `¥` glyph inside a circle, drawn as a path because a
	 * non-Latin glyph can be absent from the UI font. The parent rule sizes it to
	 * 14x14 and the stroke weight matches the shipped icon set.
	 */
	function yuanIcon() {
		return React.createElement(
			"svg",
			{ viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", "aria-hidden": true },
			React.createElement("circle", { cx: "8", cy: "8", r: "6.1", stroke: "currentColor", strokeWidth: "1.5" }),
			// the ¥: two diagonals meeting the stem, then two crossbars
			React.createElement("path", {
				d: "M5.4 4.9 8 8.2l2.6-3.3",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			React.createElement("path", { d: "M8 8.2V11.2", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }),
			React.createElement("path", { d: "M6.1 9.1h3.8M6.1 10.5h3.8", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
		);
	}

	function detailRow(key, label, value) {
		return [
			React.createElement("dt", { key: key + "-k" }, label),
			React.createElement("dd", { key: key + "-v" }, value)
		];
	}

	/**
	 * The balance strip. Props arrive from the owner site plus this registration's
	 * inject face, which carries one callback that reads the account balance.
	 *
	 * @param {any} props
	 */
	function BalanceStrip(props) {
		const readBalance = props === undefined || props === null ? undefined : props.readBalance;
		const state = React.useState(null);
		const balance = state[0];
		const setBalance = state[1];
		const openState = React.useState(false);
		const open = openState[0];
		const setOpen = openState[1];
		const positionState = React.useState(null);
		const position = positionState[0];
		const setPosition = positionState[1];
		const rootRef = React.useRef(null);
		const panelRef = React.useRef(null);

		React.useEffect(
			function () {
				if (typeof readBalance !== "function") return undefined;
				let live = true;

				/** One read; a failure or a signed-out answer clears the strip. */
				const read = function () {
					try {
						Promise.resolve(readBalance()).then(
							function (value) {
								if (live) setBalance(value === undefined ? null : value);
							},
							function (error) {
								reportOnce("read", "balance read failed: " + describeError(error));
								if (live) setBalance(null);
							}
						);
					} catch (error) {
						reportOnce("read", "balance read threw: " + describeError(error));
						if (live) setBalance(null);
					}
				};

				read();
				const timer = setInterval(read, REFRESH_MS);
				return function () {
					live = false;
					clearInterval(timer);
				};
			},
			[readBalance]
		);

		React.useEffect(
			function () {
				if (!open) return undefined;

				/** Place the portaled dialog above the trigger and clamp it in the viewport. */
				const reposition = function () {
					try {
						const anchor = rootRef.current;
						const panel = panelRef.current;
						const view = typeof window === "undefined" ? undefined : window;
						if (anchor === null || panel === null || view === undefined) return;
						const rect = anchor.getBoundingClientRect();
						const width = panel.offsetWidth;
						const height = panel.offsetHeight;
						const left = Math.min(
							Math.max(PANEL_MARGIN, rect.left + rect.width / 2 - width / 2),
							Math.max(PANEL_MARGIN, view.innerWidth - width - PANEL_MARGIN)
						);
						const top = Math.max(PANEL_MARGIN, rect.top - PANEL_GAP - height);
						setPosition({ left: Math.round(left) + "px", top: Math.round(top) + "px" });
					} catch (error) {
						reportOnce("position", "dialog positioning failed: " + describeError(error));
					}
				};

				reposition();
				// The first pass runs before layout settles; one more frame is enough for
				// the dialog's real height to exist.
				const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(reposition) : 0;

				const onPointerDown = (event) => {
					try {
						const anchor = rootRef.current;
						const panel = panelRef.current;
						const inside = (anchor !== null && anchor.contains(event.target)) || (panel !== null && panel.contains(event.target));
						if (!inside) setOpen(false);
					} catch (error) {
						setOpen(false);
					}
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};

				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown);
				window.addEventListener("resize", reposition);
				window.addEventListener("scroll", reposition, true);
				return function () {
					if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("resize", reposition);
					window.removeEventListener("scroll", reposition, true);
				};
			},
			[open]
		);

		const t = copy();
		/**
		 * Signed out, the Host answers `null`: the strip renders NOTHING, which is
		 * the required "only after sign-in" behaviour. A failed read does the same,
		 * because a stale or invented number would be worse than an absent one.
		 */
		const ready = balance !== null && balance !== undefined && balance.status === "ready";
		if (!ready) return null;

		const wallet = pickWallet(balance.value);
		const primary = amount(wallet);
		if (primary === null) return null;
		const currency = wallet !== null && wallet !== undefined && typeof wallet.currency === "string" ? wallet.currency : "CNY";
		const unit = currencyLabel(t, currency);
		const rechargeWallets = Array.isArray(balance.value) ? balance.value : [];
		const bonusWallets = Array.isArray(balance.bonusWallets) ? balance.bonusWallets : [];
		// Both extra rows need a granted wallet: without one there is no granted row to
		// show, and nothing to add to the recharge figure.
		const bonus = walletText(bonusWallets, t);
		const total = bonus === null ? null : walletText(rechargeWallets.concat(bonusWallets), t);
		const text = primary + " " + unit;

		let panel = null;
		if (open && typeof document !== "undefined") {
			try {
				const rows = [detailRow("recharge", t.recharge, text)];
				if (bonus !== null) rows.push(detailRow("bonus", t.bonus, bonus));
				if (total !== null) rows.push(detailRow("total", t.total, total));
				const body = React.createElement(
					"div",
					{
						ref: panelRef,
						className: "dshbal_panel",
						role: "dialog",
						"aria-label": t.title,
						style: position === null ? MEASURE_STYLE : position
					},
					React.createElement(
						"div",
						{ className: "dshbal_title" },
						React.createElement("span", { className: "dshbal_titleLabel" }, yuanIcon(), t.title)
					),
					React.createElement("div", { className: "dshbal_titleRule", "aria-hidden": true }),
					React.createElement("dl", { className: "dshbal_details" }, rows)
				);
				panel = createPortal === null ? body : createPortal(body, document.body);
			} catch (error) {
				reportOnce("panel", "details dialog failed, pill kept: " + describeError(error));
				panel = null;
			}
		}

		return React.createElement(
			"span",
			{ className: "dshbal_root", "data-account-balance": true, ref: rootRef },
			React.createElement("style", null, CSS),
			React.createElement(
				"button",
				{
					type: "button",
					className: "dshbal_pill",
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					"aria-label": t.title + " " + text,
					"data-account-balance-pill": true,
					onClick: function () {
						setOpen(!open);
					}
				},
				yuanIcon(),
				React.createElement("span", { className: "dshbal_label" }, text)
			),
			panel
		);
	}

	/**
	 * Register the cell, and read the balance for it.
	 *
	 * The read lives here (the apply world) rather than in the component, which
	 * never sees `ctx`; the component receives the callback through this
	 * registration's inject face.
	 *
	 * @param {any} ctx
	 * @param {any} config
	 */
	function apply(ctx, config) {
		void config;
		/**
		 * One balance read.
		 *
		 * `ctx.get` is a topology-independent lookup (unlike the `ctx.<name>`
		 * property proxy) and is strict, so it may throw where nothing provides the
		 * service — that lookup therefore gets its own guard. It is repeated per read
		 * because remote namespaces arrive with the connection: a page that boots
		 * before the gateway is up would otherwise never show a balance.
		 *
		 * @returns {Promise<any>} the balance outcome, or null when signed out.
		 */
		const readBalance = async function () {
			let account;
			try {
				account = ctx.get === undefined ? undefined : ctx.get("remote.account");
			} catch (error) {
				reportOnce("account-service", "account remote unavailable: " + describeError(error));
				return null;
			}
			if (account === undefined || account === null || typeof account.getBalance !== "function") return null;
			const result = await account.getBalance(clientMetadata());
			if (result === null || result === undefined) return null;
			if (result.ok === false) return null;
			const value = result.ok === true ? result.value : result;
			return value === undefined ? null : value;
		};

		try {
			ctx.slots.inject(SLOT, () => {
				// This callback can run inside the slot owner's `register()` call, so it
				// never lets a throw escape: a failed registration costs this strip, while
				// an escaping throw would cost the whole application's startup.
				try {
					return ctx.slots.register(
						{ name: SLOT, id: SLOT_ID, order: SLOT_ORDER, inject: () => ({ readBalance }) },
						BalanceStrip
					);
				} catch (error) {
					reportOnce("slot", "slot registration failed: " + describeError(error));
					return function dispose() {};
				}
			});
		} catch (error) {
			reportOnce("slot-wait", "slot wait failed: " + describeError(error));
		}
	}

	const inject = ["slots"];

	exports.apply = apply;
	exports.inject = inject;
}
})();
