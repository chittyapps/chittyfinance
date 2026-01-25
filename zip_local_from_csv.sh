#!/bin/zsh

CSV="Unmatched_Timeline_Documents_for_Extraction.csv"
ZIP="unmatched_local_docs.zip"

echo "Reading CSV…"

# File_Path is 4th TAB-separated column
file_list=("${(@f)$(tail -n +2 "$CSV" | awk -F'\t' '{print $4}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')}")

valid_files=()
missing_files=()

total=${#file_list[@]}
echo "Total rows: $total"

i=0
for f in "${file_list[@]}"; do
  ((i++))
  printf "\r[%d/%d] Checking…" "$i" "$total"

  # skip empty or non-absolute paths
  [[ -z "$f" || "$f" != /* ]] && continue

  if [[ -f "$f" ]]; then
    valid_files+=("$f")
  else
    echo "\nMISSING: $f"
    missing_files+=("$f")
  fi
done

echo ""
echo "Creating ZIP…"

if (( ${#valid_files[@]} == 0 )); then
  echo "ERROR: No valid files found. ZIP aborted."
  exit 1
fi

zip -r "$ZIP" "${valid_files[@]}"

echo "Done."
echo "Valid: ${#valid_files[@]}"
echo "Missing: ${#missing_files[@]}"
