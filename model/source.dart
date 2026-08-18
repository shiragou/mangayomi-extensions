class Source {
  int? id;
  String? name;
  String? baseUrl;
  String? lang;
  bool? isNsfw;
  String? sourceCodeUrl;
  String? typeSource;
  String? iconUrl;
  bool? hasCloudflare;
  String? dateFormat;
  String? dateFormatLocale;
  String? apiUrl;
  String? version;
  bool? isManga;
  int? itemType;
  bool? isFullData;
  String? appMinVerReq;
  String? additionalParams;
  int? sourceCodeLanguage;
  String? notes;

  Source.fromJson(Map<String, dynamic> json) {
    id = json['id'] as int?;
    name = json['name'] ?? '';
    baseUrl = json['baseUrl'] ?? '';
    lang = json['lang'] ?? '';
    isNsfw = json['isNsfw'] ?? false;
    typeSource = json['typeSource'] ?? '';
    iconUrl = json['iconUrl'] ?? '';
    hasCloudflare = json['hasCloudflare'] ?? false;
    dateFormat = json['dateFormat'] ?? '';
    dateFormatLocale = json['dateFormatLocale'] ?? '';
    apiUrl = json['apiUrl'] ?? '';
    version = json['version'] ?? '';
    isManga = json['isManga'] ?? false;
    itemType = json['itemType'] ?? 2;
    isFullData = json['isFullData'] ?? false;
    appMinVerReq = json['appMinVerReq'] ?? '0.5.0';
    additionalParams = json['additionalParams'] ?? '';
    sourceCodeLanguage = json['sourceCodeLanguage'] ?? 1;
    notes = json['notes'] ?? '';
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'id': id,
      'baseUrl': baseUrl,
      'lang': lang,
      'typeSource': typeSource,
      'iconUrl': iconUrl,
      'dateFormat': dateFormat,
      'dateFormatLocale': dateFormatLocale,
      'isNsfw': isNsfw,
      'hasCloudflare': hasCloudflare,
      'sourceCodeUrl': sourceCodeUrl,
      'apiUrl': apiUrl,
      'version': version,
      'isManga': isManga,
      'itemType': itemType,
      'isFullData': isFullData,
      'appMinVerReq': appMinVerReq,
      'additionalParams': additionalParams,
      'sourceCodeLanguage': sourceCodeLanguage,
      'notes': notes,
    };
  }
}

const branchName = 'main';
