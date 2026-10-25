"""Compare data across database backends without exposing record contents."""
import hashlib
import json
from datetime import datetime
from pathlib import Path

from django.apps import apps
from django.core import serializers
from django.core.serializers.json import DjangoJSONEncoder
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from accounts.models import DataRepository, compute_site_hcc


class FullPrecisionJSONEncoder(DjangoJSONEncoder):
    """Keep database timestamps intact instead of trimming to milliseconds."""

    def default(self, value):
        if isinstance(value, datetime):
            return value.isoformat().replace('+00:00', 'Z')
        return super().default(value)


class Command(BaseCommand):
    help = 'Write or compare record-count/content/HCC fingerprints for a database migration.'

    def add_arguments(self, parser):
        parser.add_argument('--output', type=Path)
        parser.add_argument('--compare', type=Path)
        parser.add_argument('--export', type=Path, help='Export the audited records as UTF-8 fixtures with full timestamp precision.')

    def handle(self, *args, **options):
        excluded = {'contenttypes.contenttype', 'auth.permission', 'sessions.session'}
        records = {}
        fixture = []
        for model in apps.get_models():
            label = model._meta.label_lower
            if label in excluded:
                continue
            data = serializers.serialize('json', model.objects.order_by('pk'),
                                         use_natural_foreign_keys=True, cls=FullPrecisionJSONEncoder)
            # Sort JSON keys so equivalent backend representations hash identically.
            canonical = json.dumps(json.loads(data), sort_keys=True, separators=(',', ':'))
            if options.get('export'):
                fixture.extend(json.loads(data))
            records[label] = {
                'count': model.objects.count(),
                'sha256': hashlib.sha256(canonical.encode()).hexdigest(),
            }
        # One-off migration verification, not a request-time aggregate.
        site_results = [(batch.pk, compute_site_hcc(batch)) for batch in DataRepository.objects.order_by('pk')]
        hcc = hashlib.sha256(json.dumps(site_results, default=str, sort_keys=True).encode()).hexdigest()
        result = {'records': records, 'site_hcc_sha256': hcc}
        if options['compare']:
            baseline = json.loads(options['compare'].read_text(encoding='utf-8'))
            if result != baseline:
                changed = sorted(label for label in set(records) | set(baseline['records'])
                                 if records.get(label) != baseline['records'].get(label))
                raise CommandError('Database differs from baseline. Changed models: ' + ', '.join(changed)
                                   + '; HCC matches: ' + str(hcc == baseline.get('site_hcc_sha256')))
            self.stdout.write(self.style.SUCCESS('Record counts, content fingerprints, and site HCC match the baseline.'))
        if options['output']:
            options['output'].write_text(json.dumps(result, indent=2), encoding='utf-8')
        if options.get('export'):
            options['export'].write_text(json.dumps(fixture, ensure_ascii=False), encoding='utf-8')
        self.stdout.write(f'Backend: {connection.vendor}; verified {len(records)} model types.')
        for label, details in sorted(records.items()):
            self.stdout.write(f"{label}: {details['count']}")
