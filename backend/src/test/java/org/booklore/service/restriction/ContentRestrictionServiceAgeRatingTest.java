package org.booklore.service.restriction;

import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.UserContentRestrictionEntity;
import org.booklore.model.enums.ContentRestrictionMode;
import org.booklore.model.enums.ContentRestrictionType;
import org.booklore.repository.UserContentRestrictionRepository;
import org.booklore.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Asymmetric age-rating semantics for {@link ContentRestrictionService#applyRestrictions}.
 *
 * <ul>
 *   <li>EXCLUDE is a denylist: null age ratings pass through.</li>
 *   <li>ALLOW_ONLY is an allowlist: null age ratings are blocked
 *       (see upstream issue grimmory-tools/grimmory#236).</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class ContentRestrictionServiceAgeRatingTest {

    private static final Long USER_ID = 1L;

    @Mock private UserContentRestrictionRepository restrictionRepository;
    @Mock private UserRepository userRepository;

    private ContentRestrictionService service;

    @BeforeEach
    void setUp() {
        service = new ContentRestrictionService(restrictionRepository, userRepository);
    }

    @Test
    void noRestrictions_passesAllBooks() {
        when(restrictionRepository.findByUserId(USER_ID)).thenReturn(List.of());

        List<BookEntity> books = List.of(
                bookWithAgeRating(1L, 5),
                bookWithAgeRating(2L, 18),
                bookWithAgeRating(3L, null)
        );

        assertThat(service.applyRestrictions(books, USER_ID))
                .extracting(BookEntity::getId)
                .containsExactly(1L, 2L, 3L);
    }

    @Test
    void exclude_blocksAtAndAboveMinExcludedBucket_passesNullAge() {
        when(restrictionRepository.findByUserId(USER_ID))
                .thenReturn(List.of(ageRestriction(ContentRestrictionMode.EXCLUDE, "16")));

        List<BookEntity> books = List.of(
                bookWithAgeRating(1L, 13),    // below threshold — allowed
                bookWithAgeRating(2L, 16),    // at threshold — blocked
                bookWithAgeRating(3L, 18),    // above — blocked
                bookWithAgeRating(4L, null)   // null — passes (denylist semantics)
        );

        assertThat(service.applyRestrictions(books, USER_ID))
                .extracting(BookEntity::getId)
                .containsExactly(1L, 4L);
    }

    @Test
    void allowOnly_passesInAllowedBuckets_blocksNullAge() {
        when(restrictionRepository.findByUserId(USER_ID))
                .thenReturn(List.of(
                        ageRestriction(ContentRestrictionMode.ALLOW_ONLY, "0"),
                        ageRestriction(ContentRestrictionMode.ALLOW_ONLY, "6"),
                        ageRestriction(ContentRestrictionMode.ALLOW_ONLY, "10")));

        List<BookEntity> books = List.of(
                bookWithAgeRating(1L, 5),     // bucket 0 — allowed
                bookWithAgeRating(2L, 9),     // bucket 6 — allowed
                bookWithAgeRating(3L, 12),    // bucket 10 — allowed (upper bound exclusive: < 13)
                bookWithAgeRating(4L, 13),    // outside allowed buckets — blocked
                bookWithAgeRating(5L, 18),    // outside — blocked
                bookWithAgeRating(6L, null)   // null — blocked (allowlist semantics)
        );

        assertThat(service.applyRestrictions(books, USER_ID))
                .extracting(BookEntity::getId)
                .containsExactly(1L, 2L, 3L);
    }

    @Test
    void allowOnly_metadataMissing_blocked() {
        when(restrictionRepository.findByUserId(USER_ID))
                .thenReturn(List.of(ageRestriction(ContentRestrictionMode.ALLOW_ONLY, "6")));

        BookEntity noMetadata = BookEntity.builder().id(1L).build();

        assertThat(service.applyRestrictions(List.of(noMetadata), USER_ID)).isEmpty();
    }

    @Test
    void exclude_metadataMissing_passes() {
        when(restrictionRepository.findByUserId(USER_ID))
                .thenReturn(List.of(ageRestriction(ContentRestrictionMode.EXCLUDE, "16")));

        BookEntity noMetadata = BookEntity.builder().id(1L).build();

        assertThat(service.applyRestrictions(List.of(noMetadata), USER_ID))
                .extracting(BookEntity::getId)
                .containsExactly(1L);
    }

    private static BookEntity bookWithAgeRating(Long id, Integer ageRating) {
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .bookId(id)
                .title("Book " + id)
                .ageRating(ageRating)
                .build();
        return BookEntity.builder().id(id).metadata(metadata).build();
    }

    private static UserContentRestrictionEntity ageRestriction(ContentRestrictionMode mode, String bucket) {
        return UserContentRestrictionEntity.builder()
                .restrictionType(ContentRestrictionType.AGE_RATING)
                .mode(mode)
                .value(bucket)
                .build();
    }
}
