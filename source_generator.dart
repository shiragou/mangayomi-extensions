import 'dart:convert';
import 'dart:io';

import 'model/source.dart';

void main() {
  final sources = <Source>[];
  final directory = Directory('javascript/novel');
  final metadataPattern = RegExp(
    r'const\s+mangayomiSources\s*=\s*(\[.*?\]);',
    dotAll: true,
  );

  for (final entity in directory.listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.js')) continue;
    final match = metadataPattern.firstMatch(entity.readAsStringSync());
    if (match == null) continue;
    for (final json in jsonDecode(match.group(1)!) as List<dynamic>) {
      final source = Source.fromJson(json as Map<String, dynamic>);
      if (source.id == null) {
        throw StateError('${entity.path}: JavaScript source must define a stable id');
      }
      source
        ..sourceCodeLanguage = 1
        ..sourceCodeUrl =
            'https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/javascript/${json['pkgPath']}';
      sources.add(source);
    }
  }

  sources.sort((a, b) => (a.name ?? '').compareTo(b.name ?? ''));
  File('novel_index.json').writeAsStringSync(
    jsonEncode(sources.map((source) => source.toJson()).toList()),
  );
}
