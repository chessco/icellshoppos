import ExpoModulesCore
import Vision
import UIKit

public class AppleVisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleVisionOcr")

    Function("isAvailable") { () -> Bool in
      #if os(iOS)
      if #available(iOS 13.0, *) {
        return true
      }
      #endif
      return false
    }

    AsyncFunction("recognizeText") { (imageUri: String, promise: Promise) in
      guard #available(iOS 13.0, *) else {
        promise.reject("ERR_UNSUPPORTED", "Apple Vision text recognition requires iOS 13 or later.")
        return
      }

      guard let url = URL(string: imageUri) else {
        promise.reject("ERR_INVALID_URI", "Invalid image URI: \(imageUri)")
        return
      }

      var imageData: Data?
      if url.scheme == "file" || url.isFileURL {
        imageData = try? Data(contentsOf: url)
      } else if let localUrl = URL(string: "file://" + imageUri) {
        imageData = try? Data(contentsOf: localUrl)
      } else {
        imageData = try? Data(contentsOf: url)
      }

      guard let data = imageData, let uiImage = UIImage(data: data), let cgImage = uiImage.cgImage else {
        promise.reject("ERR_LOAD_IMAGE", "Could not load image data from URI: \(imageUri)")
        return
      }

      let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      let request = VNRecognizeTextRequest { (request, error) in
        if let error = error {
          promise.reject("ERR_VISION_FAILED", error.localizedDescription)
          return
        }

        guard let observations = request.results as? [VNRecognizedTextObservation] else {
          promise.resolve([
            "rawText": "",
            "lines": []
          ])
          return
        }

        var lines: [String] = []
        for observation in observations {
          if let topCandidate = observation.topCandidates(1).first {
            let lineText = topCandidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if !lineText.isEmpty {
              lines.append(lineText)
            }
          }
        }

        let rawText = lines.joined(separator: "\n")
        promise.resolve([
          "rawText": rawText,
          "lines": lines
        ])
      }

      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      if #available(iOS 16.0, *) {
        request.recognitionLanguages = ["es", "en", "es-MX", "en-US"]
      }

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try requestHandler.perform([request])
        } catch {
          promise.reject("ERR_PERFORM_REQUEST", error.localizedDescription)
        }
      }
    }
  }
}
