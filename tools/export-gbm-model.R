library(gbm)

model_path <- "model/gbm_model.rds"
scaling_path <- "model/continuous_scaling_params.rds"
baseline_path <- "model/baseline_surv.rds"
output_path <- "model/gbm-survival-model.js"

json_escape <- function(value) {
  value <- gsub("\\\\", "\\\\\\\\", value)
  value <- gsub("\"", "\\\\\"", value)
  value <- gsub("\n", "\\\\n", value)
  value <- gsub("\r", "\\\\r", value)
  value <- gsub("\t", "\\\\t", value)
  paste0("\"", value, "\"")
}

to_json <- function(value) {
  if (is.null(value)) {
    return("null")
  }

  if (is.data.frame(value)) {
    rows <- lapply(seq_len(nrow(value)), function(i) as.list(value[i, , drop = FALSE]))
    return(to_json(rows))
  }

  if (is.list(value)) {
    if (!is.null(names(value)) && all(nzchar(names(value)))) {
      entries <- vapply(names(value), function(name) {
        paste0(json_escape(name), ":", to_json(value[[name]]))
      }, character(1))
      return(paste0("{", paste(entries, collapse = ","), "}"))
    }

    entries <- vapply(value, to_json, character(1))
    return(paste0("[", paste(entries, collapse = ","), "]"))
  }

  if (is.character(value)) {
    return(paste0("[", paste(vapply(value, json_escape, character(1)), collapse = ","), "]"))
  }

  if (is.logical(value)) {
    return(paste0("[", paste(ifelse(value, "true", "false"), collapse = ","), "]"))
  }

  if (is.numeric(value) || is.integer(value)) {
    if (length(value) == 1) {
      if (is.na(value) || is.nan(value) || is.infinite(value)) {
        return("null")
      }
      return(format(value, digits = 17, scientific = FALSE, trim = TRUE))
    }

    entries <- vapply(value, function(item) {
      if (is.na(item) || is.nan(item) || is.infinite(item)) {
        "null"
      } else {
        format(item, digits = 17, scientific = FALSE, trim = TRUE)
      }
    }, character(1))
    return(paste0("[", paste(entries, collapse = ","), "]"))
  }

  stop(paste("Unsupported value type:", typeof(value)))
}

gbm_model <- readRDS(model_path)
scaling_params <- readRDS(scaling_path)
baseline <- readRDS(baseline_path)

trees <- lapply(seq_len(gbm_model$n.trees), function(i) {
  tree <- pretty.gbm.tree(gbm_model, i.tree = i)
  tree <- tree[order(as.integer(rownames(tree))), ]
  lapply(seq_len(nrow(tree)), function(row_index) {
    row <- tree[row_index, ]
    list(
      splitVar = row$SplitVar,
      splitCodePred = row$SplitCodePred,
      leftNode = row$LeftNode,
      rightNode = row$RightNode,
      missingNode = row$MissingNode,
      prediction = row$Prediction
    )
  })
})

scaling <- lapply(names(scaling_params), function(name) {
  list(mean = scaling_params[[name]]$mean, sd = scaling_params[[name]]$sd)
})
names(scaling) <- names(scaling_params)

model_data <- list(
  metadata = list(
    source = "Exported from model/*.rds by tools/export-gbm-model.R",
    nTrees = gbm_model$n.trees,
    riskThreshold = -0.3334,
    trainRiskMean = gbm_model$train_risk_mean
  ),
  varNames = gbm_model$var.names,
  initF = gbm_model$initF,
  scaling = scaling,
  baseline = list(
    time = baseline$time,
    survival = baseline$survival
  ),
  trees = trees
)

dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)
writeLines(
  c(
    "window.GbmSurvivalModel = ",
    to_json(model_data),
    ";"
  ),
  output_path
)

cat(sprintf("Exported %s with %s trees.\n", output_path, gbm_model$n.trees))
