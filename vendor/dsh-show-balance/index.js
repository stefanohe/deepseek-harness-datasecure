/**
 * Host half of `dsh-show-balance`.
 *
 * This plugin contributes nothing on the Host: the balance is read by the
 * browser half through the account Remote (`ctx.remote.account.getBalance`), and
 * the strip is a Client slot occupant. The Host half exists because a Loader row
 * is what `dsh-client-modules` attaches a package's `dsh.client` declaration to —
 * the row's specifier is the bare package name, which is also the browser
 * module's registration id.
 *
 * It must still activate: the deployment's boot audit treats a single failed
 * activation as a refused startup, so a throw here would cost the user the whole
 * application. The body does nothing that can throw.
 *
 * @module dsh-show-balance
 */

/** The plugin name the Loader row carries. */
const name = 'show-balance';

/**
 * Contribute nothing Host-side.
 * @param {any} ctx - Host context (unused: this half has no Host contribution).
 */
function apply(ctx) {
  void ctx;
}

module.exports = { name, apply };
