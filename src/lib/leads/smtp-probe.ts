import net from "node:net";
import tls from "node:tls";

export type MailboxProbe = "accept" | "reject" | "inconclusive" | "unreachable";

export type ProbeBudget = { unreachable: Set<string> };

const CONNECT_MS = 5000;
const COMMAND_MS = 6000;

/** Remembers mail servers that did not answer, so a batch does not retry the same host. */
export function newProbeBudget(): ProbeBudget {
  return { unreachable: new Set() };
}

type SmtpReply = { code: number; text: string };

function readSmtp(socket: net.Socket, ms: number): Promise<SmtpReply> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => finish(new Error("timeout")), ms);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("latin1");
      const lines = buf.split(/\r?\n/).filter((line) => line.length > 0);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) finish(undefined, { code: Number(last.slice(0, 3)), text: lines.join(" ") });
    };
    const onError = (err: Error) => finish(err);
    function finish(err?: Error, reply?: SmtpReply) {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      if (err) reject(err);
      else resolve(reply!);
    }
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function writeLine(socket: net.Socket, line: string) {
  socket.write(`${line}\r\n`);
}

function isTimeout(err: unknown) {
  const code = (err as NodeJS.ErrnoException).code;
  return (err instanceof Error && err.message === "timeout") || code === "ETIMEDOUT" || code === "EAI_AGAIN";
}

/** 5xx that means this recipient, not "we blocked your connection". */
function isMailboxRefusal(text: string) {
  if (/relay|policy|spam|blocked|blacklist|denied|unauth|tls required|try again|greylist|temporary/i.test(text)) return false;
  return /user unknown|unknown user|no such user|no such recipient|mailbox (unavailable|not found|does not exist)|does not exist|recipient rejected|invalid recipient|unrouteable|no mailbox|user does not exist|address rejected|5\.1\.1|5\.1\.10|5\.2\.1/i.test(text);
}

function connectMx(host: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 25 });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout"));
    }, CONNECT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function upgradeTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host, rejectUnauthorized: false });
    const timer = setTimeout(() => {
      secure.destroy();
      reject(new Error("timeout"));
    }, CONNECT_MS);
    secure.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(secure);
    });
    secure.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Ask the domain's mail server whether it will accept this recipient.
 * A random second address distinguishes a real mailbox from a server that accepts everything.
 */
export async function probeMailbox(email: string, mxHost: string, budget: ProbeBudget): Promise<MailboxProbe> {
  if (budget.unreachable.has(mxHost)) return "unreachable";
  const domain = email.slice(email.lastIndexOf("@") + 1);
  let socket: net.Socket | undefined;
  try {
    socket = await connectMx(mxHost);
    const greet = await readSmtp(socket, COMMAND_MS);
    if (greet.code !== 220) return "inconclusive";

    writeLine(socket, "EHLO vedha.ae");
    const ehlo = await readSmtp(socket, COMMAND_MS);
    if (ehlo.code !== 250) return "inconclusive";

    if (/STARTTLS/i.test(ehlo.text)) {
      writeLine(socket, "STARTTLS");
      const ready = await readSmtp(socket, COMMAND_MS);
      if (ready.code === 220) {
        socket = await upgradeTls(socket, mxHost);
        writeLine(socket, "EHLO vedha.ae");
        const again = await readSmtp(socket, COMMAND_MS);
        if (again.code !== 250) return "inconclusive";
      }
    }

    writeLine(socket, "MAIL FROM:<>");
    let mail = await readSmtp(socket, COMMAND_MS);
    if (mail.code >= 400) {
      writeLine(socket, "MAIL FROM:<verify@vedha.ae>");
      mail = await readSmtp(socket, COMMAND_MS);
    }
    if (mail.code >= 400) return "inconclusive";

    writeLine(socket, `RCPT TO:<${email}>`);
    const rcpt = await readSmtp(socket, COMMAND_MS);
    if (rcpt.code >= 200 && rcpt.code < 300) {
      const fake = `no-such-${Math.random().toString(36).slice(2, 10)}@${domain}`;
      writeLine(socket, `RCPT TO:<${fake}>`);
      const other = await readSmtp(socket, COMMAND_MS);
      writeLine(socket, "QUIT");
      // Only a real "no such user" on the fake address proves this inbox exists.
      // A policy block (access denied, spam) does not.
      if (other.code >= 500 && isMailboxRefusal(other.text)) return "accept";
      return "inconclusive";
    }
    if (rcpt.code >= 500 && rcpt.code < 600) {
      if (isMailboxRefusal(rcpt.text)) {
        writeLine(socket, "QUIT");
        return "reject";
      }
      const fake = `no-such-${Math.random().toString(36).slice(2, 10)}@${domain}`;
      writeLine(socket, `RCPT TO:<${fake}>`);
      const other = await readSmtp(socket, COMMAND_MS);
      writeLine(socket, "QUIT");
      // Refused this address and accepted a fake one: the mailbox is the problem.
      if (other.code >= 200 && other.code < 300) return "reject";
      return "inconclusive";
    }
    writeLine(socket, "QUIT");
    return "inconclusive";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (isTimeout(err) || code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
      budget.unreachable.add(mxHost);
    }
    return "unreachable";
  } finally {
    socket?.destroy();
  }
}
