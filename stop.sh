#!/bin/bash

ps -ef | grep medusa | grep node | grep -v grep | awk '{ print $2 }' | xargs kill
