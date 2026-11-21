#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

MSG="${1:-Atualizacao UTICoMed $(date '+%Y-%m-%d %H:%M')}"

echo "1/3 Gerando bundles offline e atualizando Service Worker..."
python3 build.py

echo "2/3 Salvando alteracoes no Git..."
git add .
if git diff --cached --quiet; then
  echo "Nenhuma alteracao nova para enviar."
  exit 0
fi
git commit -m "$MSG"

echo "3/3 Enviando para o GitHub (deploy automatico no Pages)..."
git push -u origin main
echo "Pronto! Site atualizado em https://fviniciustr.github.io/UTICoMed/"
