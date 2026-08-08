model_path <- "model/rsf_model.rds"
preprocessing_path <- "model/preprocessing_params.rds"
output_path <- "model/rsf-survival-model.js"

risk_cutoff <- 1.067906
prediction_times <- c(36, 60)

json_escape <- function(value) {
  value <- gsub("\\\\", "\\\\\\\\", value)
  value <- gsub("\"", "\\\\\"", value)
  value <- gsub("\n", "\\\\n", value)
  value <- gsub("\r", "\\\\r", value)
  value <- gsub("\t", "\\\\t", value)
  paste0("\"", value, "\"")
}

json_strings <- function(values) {
  paste0("[", paste(vapply(values, json_escape, character(1)), collapse = ","), "]")
}

json_integers <- function(values) {
  paste0("[", paste(as.integer(values), collapse = ","), "]")
}

json_numbers <- function(values) {
  encoded <- vapply(values, function(value) {
    if (is.na(value) || is.nan(value) || is.infinite(value)) {
      stop("The RSF model contains a non-finite numeric value")
    }
    format(value, digits = 17, scientific = TRUE, trim = TRUE)
  }, character(1))
  paste0("[", paste(encoded, collapse = ","), "]")
}

json_named_string_arrays <- function(values) {
  entries <- vapply(names(values), function(name) {
    paste0(json_escape(name), ":", json_strings(values[[name]]))
  }, character(1))
  paste0("{", paste(entries, collapse = ","), "}")
}

rsf_model <- readRDS(model_path)
preprocessing <- readRDS(preprocessing_path)
forest <- rsf_model$forest

continuous_fields <- names(preprocessing$cont_means)
categorical_fields <- names(preprocessing$cat_levels)
expected_features <- c(continuous_fields, paste0(categorical_fields, "_int"))

if (!identical(forest$independent.variable.names, expected_features)) {
  stop("The preprocessing fields do not match the RSF forest feature order")
}

time_indexes <- match(prediction_times, forest$unique.death.times)
if (anyNA(time_indexes)) {
  stop("The RSF forest does not contain exact 36-month and 60-month time points")
}

trees <- vapply(seq_len(forest$num.trees), function(tree_index) {
  left_nodes <- forest$child.nodeIDs[[tree_index]][[1]]
  right_nodes <- forest$child.nodeIDs[[tree_index]][[2]]
  split_variables <- forest$split.varIDs[[tree_index]]
  split_values <- forest$split.values[[tree_index]]
  node_chf <- forest$chf[[tree_index]]

  node_count <- length(split_variables)
  if (!all(c(length(left_nodes), length(right_nodes), length(split_values), length(node_chf)) == node_count)) {
    stop(sprintf("RSF tree %s has inconsistent node arrays", tree_index))
  }

  terminal_nodes <- left_nodes == 0 & right_nodes == 0
  if (any(lengths(node_chf[terminal_nodes]) != length(forest$unique.death.times))) {
    stop(sprintf("RSF tree %s has an invalid terminal-node CHF", tree_index))
  }

  chf_36 <- vapply(node_chf, function(chf) if (length(chf)) chf[[time_indexes[[1]]]] else 0, numeric(1))
  chf_60 <- vapply(node_chf, function(chf) if (length(chf)) chf[[time_indexes[[2]]]] else 0, numeric(1))
  chf_final <- vapply(node_chf, function(chf) if (length(chf)) chf[[length(chf)]] else 0, numeric(1))

  paste0(
    "{\"l\":", json_integers(left_nodes),
    ",\"r\":", json_integers(right_nodes),
    ",\"v\":", json_integers(split_variables),
    ",\"s\":", json_numbers(split_values),
    ",\"h36\":", json_numbers(chf_36),
    ",\"h60\":", json_numbers(chf_60),
    ",\"hr\":", json_numbers(chf_final),
    "}"
  )
}, character(1))

model_json <- paste0(
  "{",
  "\"metadata\":{",
  "\"source\":", json_escape("Exported from model/rsf_model.rds by tools/export-rsf-model.R"), ",",
  "\"nTrees\":", forest$num.trees, ",",
  "\"riskThreshold\":", format(risk_cutoff, digits = 17, scientific = TRUE, trim = TRUE), ",",
  "\"timePoints\":", json_numbers(prediction_times),
  "},",
  "\"featureNames\":", json_strings(forest$independent.variable.names), ",",
  "\"continuousFields\":", json_strings(continuous_fields), ",",
  "\"categoryLevels\":", json_named_string_arrays(preprocessing$cat_levels), ",",
  "\"trees\":[", paste(trees, collapse = ","), "]",
  "}"
)

dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)
writeLines(c("window.RsfSurvivalModel = ", model_json, ";"), output_path)

cat(sprintf(
  "Exported %s with %s trees and %s nodes.\n",
  output_path,
  forest$num.trees,
  sum(vapply(forest$split.varIDs, length, integer(1)))
))
