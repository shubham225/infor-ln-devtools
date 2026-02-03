# Change Log

All notable changes to the "infor-ln-devtools" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Rename: `jiraId` → `ticketId` across UI, types and API payloads ✅
- API: align extension endpoints with Infor LN DevTools API spec (use `/vrcs/...`, query-based components, multipart import/upload) ✅
- Transport: switch from base64-wrapped ZIP payloads to binary multipart upload/download (with JSON fallback) ✅
- Refactor: simplified ERP service signatures to accept `Project` and `Credentials` objects ✅
- Mock server: updated to support multipart file upload and return binary ZIPs for import/compile ✅

## [0.0.1] - Initial release
- Original prototype implementation