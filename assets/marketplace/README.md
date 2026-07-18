# Agent Skill Discovery

This directory contains local metadata that helps a public Skill index, catalog maintainer, or human reviewer understand GSE.

The discovery goal is simple:

1. an Agent can find the public GitHub source;
2. an Agent can identify `SKILL.md` as the entrypoint;
3. a user can install the CLI from npm;
4. a new session can resume from `.gse/`;
5. every external claim remains tied to real evidence.

The metadata is host-neutral. It must not contain maintainer secrets, local machine paths, private project names, fabricated listing URLs, approval receipts, or claims that another host has executed GSE.

A local discovery audit proves only that this metadata is internally consistent. It does not prove Skill-directory indexing, catalog acceptance, marketplace approval, ranking, or public search visibility.
