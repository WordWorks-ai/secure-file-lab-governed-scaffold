#!/usr/bin/env bash

# Load KEY=VALUE pairs from .env without executing shell expressions.
load_env_file() {
  local env_file="${1:-}"

  if [[ -z "$env_file" ]]; then
    echo "load_env_file: env file path is required" >&2
    return 1
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "load_env_file: env file not found: $env_file" >&2
    return 1
  fi

  local raw_line line key value line_number=0

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line_number=$((line_number + 1))
    line="$(trim_env_whitespace "$raw_line")"

    if [[ -z "$line" || "${line:0:1}" == "#" ]]; then
      continue
    fi

    if [[ "$line" == export[[:space:]]* ]]; then
      line="$(trim_env_whitespace "${line#export}")"
    fi

    if [[ ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      echo "invalid env line $line_number in $env_file: expected KEY=VALUE" >&2
      return 1
    fi

    key="${line%%=*}"
    value="${line#*=}"
    value="$(trim_env_whitespace "$value")"

    if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
      value="${value//\\\"/\"}"
      value="${value//\\\\/\\}"
    elif [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    else
      value="${value%%[[:space:]]#*}"
      value="$(trim_env_whitespace "$value")"
    fi

    export "$key=$value"
  done <"$env_file"
}

trim_env_whitespace() {
  local input="$1"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"
  printf '%s' "$input"
}
