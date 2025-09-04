#!/bin/sh
mkdir -p logs
npm test 2>&1 | tee logs/test.log
npm run lint 2>&1 | tee -a logs/test.log
